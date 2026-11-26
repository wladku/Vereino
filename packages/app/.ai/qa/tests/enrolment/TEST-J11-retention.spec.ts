import { expect, test } from '@playwright/test'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  applicationDetail,
  applicationIn,
  applicationRows,
  childApplication,
  confirmedApplication,
  createGroup,
  decideApplication,
  linkCounts,
  openApplications,
  runEnrolmentJob,
  submitApplication,
} from '../_fixtures/enrolment'

// TEST-J11, retention part (section sign-up form spec phase 2, E26-S03 #799; REQ-J18, R22, R23, AC-J11): the hourly
// job deletes an application left unconfirmed for 24 hours with its link, and not a younger one; the daily job
// anonymises an application closed 30 days ago — names, contacts, the note, the reason and the keys are cleared, the
// birth date keeps its year, its links are deleted — and leaves an open one untouched. Export, erasure and the
// season-end rule are phase 3.
test.describe.configure({ timeout: 300_000 })

const HOUR = 60 * 60 * 1000

test('TEST-J11 unconfirmed deleted after 24 hours, closed anonymised after 30 days', async ({ request }) => {
  const club = await createClub(request, 'test-j11-retention')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j11-${tag}`
    const sectionSlug = `pilka-${tag}`
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J11' })
    const group = await createGroup(request, admin, {
      sectionId: section,
      name: 'Żaki',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 9,
    })
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [group] })

    const unconfirmed = `ghost-${tag}@example.test`
    expect((await submitApplication(clubSlug, sectionSlug, childApplication(unconfirmed))).status).toBe(202)
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(`anna-${tag}@example.test`, { participantFirstName: 'Zosia' }),
    )
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(`ewa-${tag}@example.test`, { participantFirstName: 'Hania', note: 'Lubi bramkę' }),
    )
    const hania = await applicationIn(request, admin, 'new', 'Hania Nowak')
    const rejected = await decideApplication(request, admin, String(hania?.id), 'reject', {
      reason: 'Za późno',
      updatedAt: hania?.updatedAt,
    })
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200)

    // R22: not yet after 23 hours, deleted after 25.
    const young = runEnrolmentJob(club, 'expire-unconfirmed', new Date(Date.now() + 23 * HOUR).toISOString())
    expect(young.deleted).toBe(0)
    const ghost = (await applicationRows(club)).find((row) => row.state === 'unconfirmed')
    expect(ghost).toBeTruthy()
    const old = runEnrolmentJob(club, 'expire-unconfirmed', new Date(Date.now() + 25 * HOUR).toISOString())
    expect(old.deleted).toBe(1)
    expect((await applicationRows(club)).some((row) => row.state === 'unconfirmed')).toBe(false)
    expect(await linkCounts(club, String(ghost?.id))).toEqual({ confirmation: 0, status: 0 })

    // R23: the rejected application is anonymised 30 days after closing; the open one stays.
    const before = runEnrolmentJob(club, 'daily', new Date(Date.now() + 29 * 24 * HOUR).toISOString())
    expect(before.anonymised).toBe(0)
    const after = runEnrolmentJob(club, 'daily', new Date(Date.now() + 31 * 24 * HOUR).toISOString())
    expect(after.anonymised).toBe(1)
    const rows = await applicationRows(club)
    const anonymised = rows.find((row) => row.id === hania?.id)
    expect(anonymised).toMatchObject({
      state: 'rejected',
      participant_first_name: null,
      guardian_email: null,
      applicant_key: null,
      email_key: null,
      participant_birth_date: '2017-01-01',
    })
    expect(anonymised?.anonymized_at).not.toBeNull()
    expect(await linkCounts(club, String(hania?.id))).toEqual({ confirmation: 0, status: 0 })
    const zosia = rows.find((row) => row.id !== hania?.id)
    expect(zosia).toMatchObject({ state: 'new', anonymized_at: null })
    expect(zosia?.participant_first_name).not.toBeNull()
    const detail = await applicationDetail(request, admin, String(hania?.id))
    expect(detail.body).toMatchObject({ anonymized: true, participantFirstName: null, email: null, note: null })
  } finally {
    await club.cleanup()
  }
})
