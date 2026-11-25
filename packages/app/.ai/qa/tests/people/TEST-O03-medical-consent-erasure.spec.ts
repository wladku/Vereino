import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { familyFor, memberAccount } from '../_fixtures/attendance'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  type Club,
} from '../_fixtures/club'
import { getMe } from '../_fixtures/members'
import { guardianMedicalConsent, personVersion, putMedical, wardOf } from '../_fixtures/medical'

// Training outlines and medical expiry spec, phase 1 (#682; REQ-O04, BR-O1, AC-O04): TEST-O03 — withdrawing the
// `medical` consent clears the date at once and a later write is refused (409 `medical_consent_missing`); the
// administrator cannot give or withdraw an adult's `medical` consent (403); the person data export (#527) carries the
// date and the consent; the anonymisation clears both.
test.describe.configure({ timeout: 420_000 })

async function storedDate(club: Club, personId: string): Promise<{ date: boolean; consents: Record<string, unknown> }> {
  const rows = await withClient((client) =>
    client.query<{ has_date: boolean; consents: Record<string, unknown> }>(
      `select medical_valid_until is not null as has_date, consents from people_persons where tenant_id = $1 and id = $2`,
      [club.tenant.tenantId, personId],
    ),
  )
  return { date: rows.rows[0]?.has_date ?? false, consents: rows.rows[0]?.consents ?? {} }
}

async function departAndAnonymize(request: APIRequestContext, admin: string, personId: string, lastName: string) {
  const lastDay = calendarDate()
  const preview = await call<{ previewToken?: string }>(request, 'POST', '/api/people/departures/preview', admin, {
    data: { personIds: [personId], lastDay },
  })
  expect(preview.status, JSON.stringify(preview.body)).toBe(200)
  const departed = await call(request, 'POST', '/api/people/departures', admin, {
    data: { personIds: [personId], lastDay, previewToken: preview.body?.previewToken },
  })
  expect(departed.status, JSON.stringify(departed.body)).toBe(200)
  const recorded = await call<{ id?: string }>(request, 'POST', '/api/people/departure-requests', admin, {
    data: { subjectPersonId: personId, requesterKind: 'self', erasure: true, note: 'Letter' },
  })
  expect(recorded.status, JSON.stringify(recorded.body)).toBe(201)
  const anonymized = await call(request, 'POST', `/api/people/persons/${personId}/anonymize`, admin, {
    data: { requestId: String(recorded.body?.id), confirmLastName: lastName },
    headers: { [OPTIMISTIC_LOCK_HEADER]: await personVersion(request, admin, personId) },
  })
  expect(anonymized.status, JSON.stringify(anonymized.body)).toBe(200)
}

test('TEST-O03 withdrawal and anonymisation clear the medical date; the export carries it', async ({ request }) => {
  const club = await createClub(request, 'test-o03')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const ward = family.younger.personId

    // A ward's date with the guardian's consent; the withdrawal clears it at once.
    await guardianMedicalConsent(request, family.guardian.token, ward, true)
    const set = await putMedical(
      request,
      family.guardian.token,
      ward,
      calendarDate(120),
      (await wardOf(request, family.guardian.token, ward)).medical?.updatedAt ?? null,
    )
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    expect((await storedDate(club, ward)).date).toBe(true)
    await guardianMedicalConsent(request, family.guardian.token, ward, false)
    expect((await storedDate(club, ward)).date).toBe(false)
    const after = await wardOf(request, family.guardian.token, ward)
    expect(after.medical).toMatchObject({ consentInForce: false, validUntil: null })
    const refused = await putMedical(
      request,
      family.guardian.token,
      ward,
      calendarDate(120),
      after.medical?.updatedAt ?? null,
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('medical_consent_missing')

    // An adult's own consent and date; the administrator cannot touch the consent.
    const lastName = 'Dorosla O03'
    const adultId = await createPerson(request, admin, { firstName: 'Ewa', lastName, birthDate: birthDateTurning(30) })
    const adult = await memberAccount(request, club, adultId, 'ewa-o03')
    const staff = await call<{ code?: string }>(request, 'POST', `/api/people/persons/${adultId}/consents`, admin, {
      data: { changes: { medical: true } },
      headers: { [OPTIMISTIC_LOCK_HEADER]: await personVersion(request, admin, adultId) },
    })
    expect(staff.status, JSON.stringify(staff.body)).toBe(403)
    expect(staff.body?.code).toBe('medical_consent_subject_only')
    const me = await getMe(request, adult.token)
    const consented = await call<{ updatedAt?: string }>(request, 'PUT', '/api/people/me/consents', adult.token, {
      data: { changes: { medical: true } },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String((me.body as { person?: { updatedAt?: string } }).person?.updatedAt) },
    })
    expect(consented.status, JSON.stringify(consented.body)).toBe(200)
    const own = await putMedical(request, adult.token, adultId, calendarDate(200), String(consented.body?.updatedAt))
    expect(own.status, JSON.stringify(own.body)).toBe(200)

    // The person data export carries the date and the consent (REQ-O04, #527).
    const exported = await call(request, 'GET', `/api/people/persons/${adultId}/data-export`, admin)
    expect(exported.status, JSON.stringify(exported.body)).toBe(200)
    const text = JSON.stringify(exported.body)
    expect(text).toContain(`"medicalValidUntil":"${calendarDate(200)}"`)
    expect(text).toContain('"medical":{"granted":true')

    // The anonymisation clears the date and the consent.
    await departAndAnonymize(request, admin, adultId, lastName)
    const erased = await storedDate(club, adultId)
    expect(erased.date).toBe(false)
    expect(erased.consents).toEqual({})
  } finally {
    await club.cleanup()
  }
})
