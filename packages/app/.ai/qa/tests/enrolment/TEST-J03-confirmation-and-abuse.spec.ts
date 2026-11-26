import { expect, test } from '@playwright/test'
import { calendarDate, createClub, createPerson, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { awaitEmails, emailsTo } from '../_fixtures/communication'
import { publicCall } from '../_fixtures/declaration-links'
import {
  CONFIRM_SUBJECT,
  RECEIVED_SUBJECT,
  applicationRows,
  childApplication,
  confirmApplication,
  confirmToken,
  createGroup,
  expireConfirmationLinks,
  formApi,
  listApplications,
  openApplications,
  publicApplicationsApi,
  submitApplication,
} from '../_fixtures/enrolment'
import { addMembership } from '../_fixtures/groups'
import { publish } from '../_fixtures/publication'

// TEST-J03 (section sign-up form spec phase 2, E26-S03 #799; REQ-J07, REQ-J08, REQ-J15 (DD-J09), AC-J04): nothing
// reaches the club before the one-hour, one-time e-mail confirmation. Opening the confirmation page (GET) changes
// nothing; "send again" issues a new link and the old one stops working; a confirmation through another club's slug
// answers 410 like an unknown token; the first confirmation of an application to a full group puts it on the group's
// waiting list as number 1; a second confirmation answers 410 used; an expired link 410; a filled honeypot 422
// `application_refused`; the sixth application from one address within the hour 429 (the foundation's opt-in test
// limiter, `x-om-test-rate-limit: on`).
test.describe.configure({ timeout: 300_000 })

test('TEST-J03 confirmation link, waiting list on a full group, honeypot and the per-address limit', async ({
  request,
}) => {
  const club = await createClub(request, 'test-j03-confirmation')
  const other = await createClub(request, 'test-j03-other-club')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j03-${tag}`
    const sectionSlug = `pilka-${tag}`
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J03' })
    const zaki = await createGroup(request, admin, {
      sectionId: section,
      name: 'Żaki 7–9',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 9,
    })
    const full = await createGroup(request, admin, {
      sectionId: section,
      name: 'Pełna grupa',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 12,
      placesLimit: 1,
    })
    const member = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Zawodnik',
      birthDate: '2016-05-01',
    })
    await addMembership(request, admin, {
      groupId: full,
      personId: member,
      role: 'participant',
      validFrom: calendarDate(-30),
    })
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [zaki, full] })
    const otherSlug = `j03-other-${tag}`
    await publish(request, other.adminToken, otherSlug, ['contact'])

    const form = await publicCall('GET', formApi(clubSlug, sectionSlug))
    expect(form.status, form.text).toBe(200)
    const groups = (form.body?.groups ?? []) as { id: string; full: boolean }[]
    expect(groups.find((group) => group.id === full)?.full).toBe(true)
    expect(groups.find((group) => group.id === zaki)?.full).toBe(false)
    expect(form.text).not.toContain('"occupied"')

    // An application to the full group; nothing in the coordinator's list before it is confirmed.
    const email = `anna-${tag}@example.test`
    const sent = await submitApplication(
      clubSlug,
      sectionSlug,
      childApplication(email, { groupId: full, chooseForUs: false }),
    )
    expect(sent.status, sent.text).toBe(202)
    expect(sent.body).toEqual({ status: 'pending_confirmation' })
    const first = await confirmToken(email)
    for (const tab of ['new', 'waiting']) {
      const list = await listApplications(request, admin, { tab })
      expect(list.body?.total, `tab ${tab} before confirmation`).toBe(0)
    }

    // The page's GET spends nothing.
    const page = await request.get(`/p/${clubSlug}/applications/confirm/${first}`)
    expect(page.status()).toBe(200)
    expect((await applicationRows(club)).map((row) => row.state)).toEqual(['unconfirmed'])

    // "Send again": a new link; the old one stops working.
    const resent = await publicCall('POST', publicApplicationsApi(clubSlug, 'resend-confirmation'), { email })
    expect(resent.status, resent.text).toBe(202)
    const second = await confirmToken(email, 2)
    expect(second).not.toBe(first)
    const old = await confirmApplication(clubSlug, first)
    expect(old.status, old.text).toBe(410)

    // Another club's slug answers like an unknown token.
    const foreign = await confirmApplication(otherSlug, second)
    expect(foreign.status, foreign.text).toBe(410)
    expect(foreign.body?.code).toBe('token_link_expired')

    const confirmed = await confirmApplication(clubSlug, second)
    expect(confirmed.status, confirmed.text).toBe(200)
    expect(confirmed.body).toMatchObject({ state: 'waiting', waitingNumber: 1 })
    const again = await confirmApplication(clubSlug, second)
    expect(again.status, again.text).toBe(410)
    expect(again.body?.code).toBe('token_link_used')
    const received = await awaitEmails(email, RECEIVED_SUBJECT)
    expect(received).toHaveLength(1)
    expect(received[0].text).toContain('number 1')
    const waiting = await listApplications(request, admin, { tab: 'waiting' })
    expect(waiting.body?.items.map((item) => [item.groupId, item.waitingNumber])).toEqual([[full, 1]])

    // An expired link.
    const late = `late-${tag}@example.test`
    expect((await submitApplication(clubSlug, sectionSlug, childApplication(late))).status).toBe(202)
    const lateToken = await confirmToken(late)
    expect(await expireConfirmationLinks(club)).toBeGreaterThanOrEqual(1)
    const expired = await confirmApplication(clubSlug, lateToken)
    expect(expired.status, expired.text).toBe(410)
    expect(expired.body?.code).toBe('token_link_expired')

    // The honeypot.
    const bot = await submitApplication(
      clubSlug,
      sectionSlug,
      childApplication(`bot-${tag}@example.test`, { website: 'http://spam.example' }),
    )
    expect(bot.status, bot.text).toBe(422)
    expect(bot.body?.code).toBe('application_refused')

    // Five applications an hour per address; the sixth answers 429.
    const flood = `flood-${tag}@example.test`
    const limited = { 'x-om-test-rate-limit': 'on' }
    const statuses: number[] = []
    for (let index = 0; index < 6; index += 1) {
      const result = await publicCall(
        'POST',
        `/api/enrolment/public/${clubSlug}/sections/${sectionSlug}/applications`,
        childApplication(flood, { participantFirstName: `Ola${String(index)}` }),
        limited,
      )
      statuses.push(result.status)
    }
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429])
    expect((await awaitEmails(flood, CONFIRM_SUBJECT, 5)).length).toBeGreaterThanOrEqual(5)
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
