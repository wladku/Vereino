import { expect, test } from '@playwright/test'
import { addDays, scheduleFor, type WeekdayCode } from '../_fixtures/activities'
import { ensureDefaultPolicies, oneOff } from '../_fixtures/attendance'
import { birthDateTurning, calendarDate, createClub, createPerson, mercato, uniqueSuffix } from '../_fixtures/club'
import { awaitEmails } from '../_fixtures/communication'
import {
  dropRemindersSchedule,
  expireLinks,
  linkApi,
  publicCall,
  remindersSchedules,
  requestLink,
  startSession,
  tokenFromEmail,
} from '../_fixtures/declaration-links'
import { addMembership } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { uniqueAddress } from '../_fixtures/messaging'
import { createGuardianship } from '../_fixtures/people'
import { publish } from '../_fixtures/publication'

// Issue #192, the follow-ups of the #182 review (club spec REQ-017, TEST-017): a minor's own declaration through a link
// shows that it waits for the guardian; an expired link's 410 names the request page of its session and the page's
// "Request a new link" opens it; a session that has started offers no "Send me a link" and its request page says
// "Declarations closed"; the link page and its API send no referrer; and `activities set-up-club` gives a club set up
// before the evening reminders their 18:00 schedule, once.
test.describe.configure({ timeout: 600_000 })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

test('ISSUE-192 declaration link follow-ups: pending state, expired-link target, closed request, no referrer, reminder backfill', async ({
  request,
  page,
}) => {
  const club = await createClub(request, 'issue-192')
  try {
    const admin = club.adminToken
    expect((await updateClubSettings(request, admin, { defaultLocale: 'en' })).status).toBe(200)
    const slug = `i192-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    // A tenant created through the API runs no `seedDefaults`: the default policies (matches `guardian_confirm`) are
    // created here.
    await ensureDefaultPolicies(request, club)
    const since = addDays(calendarDate(), -30)

    // A 16-year-old participant with an own address and a guardian: their own "yes" to a match waits for the guardian
    // (the default `guardian_confirm` policy for matches).
    const teenEmail = uniqueAddress('teen')
    const guardian = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName: 'Czekalska',
      birthDate: birthDateTurning(41),
      email: uniqueAddress('ewa'),
    })
    const teen = await createPerson(request, admin, {
      firstName: 'Kuba',
      lastName: 'Czekalski',
      birthDate: birthDateTurning(16),
      email: teenEmail,
    })
    await createGuardianship(request, admin, {
      guardianPersonId: guardian,
      wardPersonId: teen,
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: since,
    })
    await addMembership(request, admin, { groupId: zaki, personId: teen, role: 'participant', validFrom: since })

    const session = async (name: string, type: string, weekday: WeekdayCode) =>
      oneOff(request, club, coordinator, {
        groupId: zaki,
        placeId: pitch,
        name,
        type,
        weekday,
        fromDaysAhead: 2,
        start: '10:00',
        end: '11:30',
      })
    const match = await session('Mecz 192', 'match', 'SA')
    const training = await session('Trening 192', 'training', 'TU')

    // The link of the minor themself: the declaration is saved as waiting for the guardian, and the page says so.
    expect((await requestLink(teenEmail, slug, match.session.id)).status).toBe(202)
    const matchToken = tokenFromEmail((await awaitEmails(teenEmail, 'Mecz 192'))[0])
    const declared = await publicCall('POST', linkApi(matchToken), { personId: teen, declared: 'yes' })
    expect(declared.status, declared.text).toBe(201)
    expect(declared.body).toMatchObject({ declared: 'yes', declarationStatus: 'pending_guardian', actingRole: 'self' })
    const read = await publicCall('GET', linkApi(matchToken))
    expect(read.status, read.text).toBe(200)
    expect(read.body?.persons).toEqual([expect.objectContaining({ id: teen, declarationStatus: 'pending_guardian' })])

    // An expired link: the 410 names the request page of its session (the club publishes its pages).
    expect((await requestLink(teenEmail, slug, training.session.id)).status).toBe(202)
    const trainingToken = tokenFromEmail((await awaitEmails(teenEmail, 'Trening 192'))[0])
    expect(await expireLinks(teen, training.session.id)).toBe(1)
    const expired = await publicCall('GET', linkApi(trainingToken))
    expect(expired.status, expired.text).toBe(410)
    const requestPage = `/club/link?club=${slug}&session=${training.session.id}`
    expect(expired.body).toMatchObject({ code: 'token_link_expired', requestLinkPath: requestPage })
    expect(expired.text).not.toContain('Kuba')

    // The browser, signed out.
    const guest = await page.context().browser()?.newContext()
    if (!guest) throw new Error('[internal] no browser')
    try {
      const guestPage = await guest.newPage()

      // The link page and its API: no referrer, so the token in the address goes nowhere.
      const linkPage = await guestPage.goto(new URL(`/club/d/${matchToken}`, BASE_URL).toString())
      expect(linkPage?.headers()['referrer-policy']).toBe('no-referrer')
      const api = await guestPage.request.get(new URL(linkApi(matchToken), BASE_URL).toString())
      expect(api.headers()['referrer-policy']).toBe('no-referrer')
      const card = guestPage.locator(`[data-testid="declaration-link-person"][data-person-id="${teen}"]`)
      await expect(card.getByTestId('declaration-link-pending')).toHaveText(
        /Awaiting guardian confirmation|Czeka na potwierdzenie opiekuna/,
      )

      // "Request a new link" of an expired link opens the request page of its session.
      await guestPage.goto(new URL(`/club/d/${trainingToken}`, BASE_URL).toString())
      const expiredPanel = guestPage.getByTestId('token-page-expired')
      await expect(expiredPanel).toBeVisible()
      await expect(expiredPanel.getByRole('link')).toHaveAttribute('href', requestPage)
      await expiredPanel.getByRole('link').click()
      await expect(guestPage.getByTestId('link-request-session')).toContainText('Trening 192')
      await expect(guestPage.getByTestId('link-request-email')).toBeVisible()

      // After the start: no "Send me a link" on the public page, and the request page says "Declarations closed".
      await startSession(training.session.id)
      await guestPage.goto(new URL(`/p/${slug}/s/${training.session.id}`, BASE_URL).toString())
      await expect(guestPage.getByTestId('public-session-activity')).toHaveText('Trening 192')
      await expect(guestPage.getByTestId('public-session-request-link')).toHaveCount(0)
      await guestPage.goto(new URL(requestPage, BASE_URL).toString())
      await expect(guestPage.getByTestId('link-request-closed')).toBeVisible()
      await expect(guestPage.getByTestId('link-request-email')).toHaveCount(0)

      // A session still ahead keeps offering it.
      await guestPage.goto(new URL(`/p/${slug}/s/${match.session.id}`, BASE_URL).toString())
      await expect(guestPage.getByTestId('public-session-request-link')).toBeVisible()
    } finally {
      await guest.close()
    }

    // A club set up before the evening reminders existed: `set-up-club` registers their schedule, and a rerun adds
    // nothing.
    const orgId = club.tenant.organizationId
    await dropRemindersSchedule(orgId)
    expect(await remindersSchedules(orgId)).toHaveLength(0)
    const scope = ['--tenant', club.tenant.tenantId, '--org', orgId]
    const setUp = mercato(['activities', 'set-up-club', ...scope])
    expect(setUp).toMatchObject({
      schedules: { generateOccurrences: true, expireGuardianConfirmations: true, sendDeclarationReminders: true },
    })
    expect(await remindersSchedules(orgId)).toEqual([
      expect.objectContaining({ schedule_value: '0 18 * * *', is_enabled: true }),
    ])
    expect(mercato(['activities', 'set-up-club', ...scope])).toMatchObject({ policiesCreated: 0 })
    expect(await remindersSchedules(orgId)).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
