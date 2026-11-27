import { expect, test } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, mercato, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { awaitEmails } from '../_fixtures/communication'
import { documentOf, exportPerson, section as exportSection } from '../_fixtures/data-export'
import { createSeason } from '../_fixtures/groups'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  acceptApplication,
  acceptedRow,
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
// birth date keeps its year, its links are deleted — and leaves an open one untouched. Phase 3 (E26-S04 #800; R24,
// REQ-J18): an open application whose season ended is closed as `expired` by the daily job and the applicant is
// e-mailed; the data export of an accepted person contains the application; anonymising that person anonymises it;
// the applicant CLI finds an applicant's applications by e-mail and `--erase` deletes, withdraws and anonymises them
// and erases the address's deliveries.
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

const DAY = 24 * HOUR

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
}

/** Deliveries of the club without a person that still hold an address hash (an applicant's e-mails). */
function bareAddressDeliveries(organizationId: string): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `select count(*) from foundation_deliveries
        where organization_id = $1 and person_id is null and email_hash is not null`,
      [organizationId],
    )
    return Number(rows[0].count)
  })
}

test('TEST-J11 season end, export, erasure and the applicant CLI', async ({ request }) => {
  const club = await createClub(request, 'test-j11-phase-3')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j11b-${tag}`
    const sectionSlug = `pilka-${tag}`
    const today = calendarDate()
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J11b' })
    const group = await createGroup(request, admin, { sectionId: section, name: 'Dorośli', kind: 'class_group' })
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [group] })
    const scope = ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]

    // --- Season end: the season of the reference date ends; the daily job closes the open application ---
    const ewa = `ewa-${tag}@example.test`
    await confirmedApplication(clubSlug, sectionSlug, childApplication(ewa, { participantFirstName: 'Ewa' }))
    const open = await applicationIn(request, admin, 'new', 'Ewa Nowak')
    const referenceDate = String((await applicationDetail(request, admin, String(open?.id))).body?.referenceDate)
    await createSeason(request, admin, {
      name: `Sezon J11 ${tag}`,
      startsOn: addDays(referenceDate, -30),
      endsOn: addDays(today, 2),
    })
    expect(runEnrolmentJob(club, 'daily', `${addDays(today, 1)}T08:00:00+01:00`).expired).toBe(0)
    expect(runEnrolmentJob(club, 'daily', `${addDays(today, 5)}T08:00:00+01:00`).expired).toBe(1)
    expect((await acceptedRow(club, String(open?.id))).state).toBe('expired')
    const closedMail = await awaitEmails(ewa, 'Your application: Piłka nożna J11b')
    expect(closedMail[0].text).toContain('apply again')

    // --- Export and erasure of an accepted adult ---
    const adam = `adam-${tag}@example.test`
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(adam, {
        kind: 'adult',
        participantFirstName: 'Adam',
        participantLastName: `Dorosły${tag}`,
        participantBirthDate: '1990-02-02',
        guardianFirstName: null,
        guardianLastName: null,
        guardianStatement: undefined,
        groupId: group,
        chooseForUs: false,
        phone: '600 900 900',
      }),
    )
    const adult = await applicationIn(request, admin, 'new', `Adam Dorosły${tag}`)
    const accepted = await acceptApplication(request, admin, String(adult?.id), {
      groupId: group,
      startDay: today,
      sendInvitation: false,
      updatedAt: adult?.updatedAt,
    })
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    expect(accepted.body?.guardianPersonId).toBeNull()
    const personId = String(accepted.body?.participantPersonId)
    const exported = documentOf(await exportPerson(request, admin, personId))
    const part = exportSection(exported, 'enrolment_applications')
    expect(part).toMatchObject({ module: 'enrolment', activity: 'A17', portable: true })
    expect(part.rows).toEqual([
      expect.objectContaining({ id: adult?.id, role: 'participant', kind: 'adult', state: 'accepted' }),
    ])
    expect(JSON.stringify(part.rows)).toContain(adam)

    const lastDay = today
    const preview = await call<{ previewToken?: string }>(request, 'POST', '/api/people/departures/preview', admin, {
      data: { personIds: [personId], lastDay },
    })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const departed = await call(request, 'POST', '/api/people/departures', admin, {
      data: { personIds: [personId], lastDay, previewToken: preview.body?.previewToken },
    })
    expect(departed.status, JSON.stringify(departed.body)).toBe(200)
    const erasureRequest = await call<{ id?: string }>(request, 'POST', '/api/people/departure-requests', admin, {
      data: { subjectPersonId: personId, requesterKind: 'self', erasure: true, note: 'Letter' },
    })
    expect(erasureRequest.status, JSON.stringify(erasureRequest.body)).toBe(201)
    const version = await call<{ updatedAt?: string }>(request, 'GET', `/api/people/persons/${personId}`, admin)
    const erased = await call(request, 'POST', `/api/people/persons/${personId}/anonymize`, admin, {
      data: { requestId: erasureRequest.body?.id, confirmLastName: `Dorosły${tag}` },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(version.body?.updatedAt) },
    })
    expect(erased.status, JSON.stringify(erased.body)).toBe(200)
    const anonymised = (await applicationRows(club)).find((row) => row.id === adult?.id)
    expect(anonymised).toMatchObject({ participant_first_name: null, guardian_email: null, email_key: null })
    expect(anonymised?.anonymized_at).not.toBeNull()

    // --- The applicant CLI: find by e-mail, then erase ---
    const ola = `ola-${tag}@example.test`
    await confirmedApplication(clubSlug, sectionSlug, childApplication(ola))
    const sent = await submitApplication(
      clubSlug,
      sectionSlug,
      childApplication(ola, { participantFirstName: 'Kasia', participantBirthDate: '2016-06-06' }),
    )
    expect(sent.status, sent.text).toBe(202)
    const found = mercato(['enrolment', 'applicant-data', ...scope, '--email', ola]) as {
      applications: { state: string; email: string; participantFirstName: string }[]
    }
    expect(found.applications.map((entry) => [entry.participantFirstName, entry.state])).toEqual([
      ['Ola', 'new'],
      ['Kasia', 'unconfirmed'],
    ])
    expect(found.applications[0].email).toBe(ola)
    const before = await bareAddressDeliveries(club.tenant.organizationId)
    const counts = mercato(['enrolment', 'applicant-data', ...scope, '--email', ola, '--erase']) as {
      deleted: number
      withdrawn: number
      anonymised: number
      deliveries: number
    }
    expect(counts).toMatchObject({ deleted: 1, withdrawn: 1, anonymised: 1 })
    expect(counts.deliveries).toBeGreaterThanOrEqual(3)
    expect(await bareAddressDeliveries(club.tenant.organizationId)).toBe(before - counts.deliveries)
    const after = mercato(['enrolment', 'applicant-data', ...scope, '--email', ola]) as { applications: unknown[] }
    expect(after.applications).toEqual([])
  } finally {
    await club.cleanup()
  }
})
