import { expect, test } from '@playwright/test'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { awaitEmails } from '../_fixtures/communication'
import {
  applicationDetail,
  applicationIn,
  applicationStatus,
  childApplication,
  confirmedApplication,
  createGroup,
  decideApplication,
  openApplications,
} from '../_fixtures/enrolment'

// TEST-J06, reject and waiting part (section sign-up form spec phase 2, E26-S03 #799; REQ-J12, AC-J07): the
// coordinator rejects an application with a reason the applicant sees in the e-mail and on the status page, and puts
// another on a group's waiting list, whose number the applicant is e-mailed. Each decision needs the version
// (`updatedAt`); a stale one answers 409; a closed application cannot be decided again (409).
test.describe.configure({ timeout: 300_000 })

test('TEST-J06 reject with a reason and put on the waiting list', async ({ request }) => {
  const club = await createClub(request, 'test-j06-decisions')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j06-${tag}`
    const sectionSlug = `pilka-${tag}`
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J06' })
    const zaki = await createGroup(request, admin, {
      sectionId: section,
      name: 'Żaki',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 9,
    })
    const orliki = await createGroup(request, admin, {
      sectionId: section,
      name: 'Orliki',
      kind: 'class_group',
      ageFrom: 10,
      ageTo: 11,
    })
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [zaki, orliki] })

    const anna = `anna-${tag}@example.test`
    const rejected = await confirmedApplication(clubSlug, sectionSlug, childApplication(anna))
    const marek = `marek-${tag}@example.test`
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(marek, {
        participantFirstName: 'Kuba',
        participantLastName: 'Lis',
        groupId: zaki,
        chooseForUs: false,
      }),
    )
    const ola = await applicationIn(request, admin, 'new', 'Ola Nowak')
    const kuba = await applicationIn(request, admin, 'new', 'Kuba Lis')
    expect(ola && kuba).toBeTruthy()

    const stale = await decideApplication(request, admin, String(ola?.id), 'reject', {
      reason: 'Brak miejsc',
      updatedAt: '2020-01-01T00:00:00.000Z',
    })
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    const noReason = await decideApplication(request, admin, String(ola?.id), 'reject', {
      reason: '',
      updatedAt: ola?.updatedAt,
    })
    expect(noReason.status, JSON.stringify(noReason.body)).toBeGreaterThanOrEqual(400)
    const reject = await decideApplication(request, admin, String(ola?.id), 'reject', {
      reason: 'No places in this age group this season',
      updatedAt: ola?.updatedAt,
    })
    expect(reject.status, JSON.stringify(reject.body)).toBe(200)
    expect(reject.body).toMatchObject({ state: 'rejected' })
    const mail = await awaitEmails(anna, 'Your application')
    expect(mail[0].text).toContain('No places in this age group this season')
    const status = await applicationStatus(clubSlug, rejected.statusToken)
    expect(status.body).toMatchObject({ state: 'rejected', decisionReason: 'No places in this age group this season' })
    const again = await decideApplication(request, admin, String(ola?.id), 'reject', {
      reason: 'Again',
      updatedAt: String(reject.body?.updatedAt),
    })
    expect(again.status, JSON.stringify(again.body)).toBe(409)

    const wait = await decideApplication(request, admin, String(kuba?.id), 'waiting', {
      groupId: orliki,
      updatedAt: kuba?.updatedAt,
    })
    expect(wait.status, JSON.stringify(wait.body)).toBe(200)
    expect(wait.body).toMatchObject({ state: 'waiting', waitingNumber: 1 })
    const waitingMail = await awaitEmails(marek, 'Waiting list: Orliki')
    expect(waitingMail[0].text).toContain('number 1')
    const detail = await applicationDetail(request, admin, String(kuba?.id))
    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({ state: 'waiting', groupId: orliki, waitingNumber: 1, ageFit: 'outside' })
    expect(await applicationIn(request, admin, 'closed', 'Ola Nowak')).toMatchObject({ state: 'rejected' })
  } finally {
    await club.cleanup()
  }
})
