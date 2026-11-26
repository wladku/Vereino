import { expect, test } from '@playwright/test'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { emailsTo } from '../_fixtures/communication'
import { publicCall } from '../_fixtures/declaration-links'
import {
  NEW_LINK_SUBJECT,
  applicationIn,
  applicationStatus,
  childApplication,
  confirmedApplication,
  createGroup,
  openApplications,
  publicApplicationsApi,
  statusToken,
} from '../_fixtures/enrolment'

// TEST-J04 (section sign-up form spec phase 2, E26-S03 #799; REQ-J09, AC-J05): the status link shows the state of
// that application only and lets the applicant withdraw it; asking for a new link by e-mail answers 202 for any
// address and replaces the old link, which stops working; a withdrawn application moves to Closed with an e-mail; a
// second withdrawal answers 409.
test.describe.configure({ timeout: 300_000 })

test('TEST-J04 status link, new link and withdrawal', async ({ request }) => {
  const club = await createClub(request, 'test-j04-status')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j04-${tag}`
    const sectionSlug = `pilka-${tag}`
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J04' })
    const group = await createGroup(request, admin, {
      sectionId: section,
      name: 'Żaki',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 9,
    })
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [group] })

    const email = `anna-${tag}@example.test`
    const { statusToken: first } = await confirmedApplication(clubSlug, sectionSlug, childApplication(email))
    const status = await applicationStatus(clubSlug, first)
    expect(status.status, status.text).toBe(200)
    expect(status.body).toMatchObject({
      state: 'new',
      sectionName: 'Piłka nożna J04',
      canWithdraw: true,
      groupName: null,
    })
    expect(status.text).not.toContain(email)

    // A new link for the address; any other address gets the same answer.
    const unknown = await publicCall('POST', publicApplicationsApi(clubSlug, 'resend-link'), {
      email: `nobody-${tag}@example.test`,
    })
    expect(unknown.status, unknown.text).toBe(202)
    const asked = await publicCall('POST', publicApplicationsApi(clubSlug, 'resend-link'), { email })
    expect(asked.status, asked.text).toBe(202)
    expect(asked.body).toEqual(unknown.body)
    const second = await statusToken(email, NEW_LINK_SUBJECT)
    expect(second).not.toBe(first)
    const old = await applicationStatus(clubSlug, first)
    expect(old.status, old.text).toBe(410)

    const withdrawn = await publicCall('POST', publicApplicationsApi(clubSlug, 'withdraw'), { token: second })
    expect(withdrawn.status, withdrawn.text).toBe(200)
    await expect.poll(() => emailsTo(email, 'Application withdrawn').length).toBe(1)
    const after = await applicationStatus(clubSlug, second)
    expect(after.status, after.text).toBe(200)
    expect(after.body).toMatchObject({ state: 'withdrawn', canWithdraw: false })
    const twice = await publicCall('POST', publicApplicationsApi(clubSlug, 'withdraw'), { token: second })
    expect(twice.status, twice.text).toBe(409)
    expect(twice.body?.code).toBe('application_state_conflict')

    expect(await applicationIn(request, admin, 'new', 'Ola Nowak')).toBeUndefined()
    expect(await applicationIn(request, admin, 'closed', 'Ola Nowak')).toMatchObject({ state: 'withdrawn' })
  } finally {
    await club.cleanup()
  }
})
