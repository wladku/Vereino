import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  call,
  createClub,
  createPerson,
  createStaff,
  getPerson,
  signInAs,
} from '../_fixtures/club'
import { SENSITIVE_PERSON_FIELDS, persons } from '../_fixtures/people'

// TEST-004 (club spec, security; REQ-001), the part foundation TEST-F06 does not already cover: F06 checks the PESEL
// ciphertext and hash on create, the 409 on a second create, the 422, the PESEL hidden on the coordinator's own record
// and in lists, and the surname search. Here: the duplicate on the update path (the first record keeps its PESEL), a
// cleared PESEL is free again, a coordinator reading another person (#26: basic data, club-wide) gets neither the
// PESEL nor the contact details, and the phone, e-mail and notes added by #26 are ciphertext in the database.
test.describe.configure({ timeout: 300_000 })

// Synthetic numbers with valid check digits (engineering standards S5.9: no real PESEL in test data).
const PESEL_A = '90010100009'
const PESEL_B = '85020300017'

type RawPerson = {
  pesel: string | null
  pesel_hash: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

async function rawPerson(id: string): Promise<RawPerson | undefined> {
  return withClient(async (client) => {
    const { rows } = await client.query<RawPerson>(
      'select pesel, pesel_hash, email, phone, notes from people_persons where id = $1',
      [id],
    )
    return rows[0]
  })
}

test('TEST-004 PESEL on update, cleared PESEL, coordinator without PESEL or contacts, encrypted contact data', async ({
  request,
}) => {
  const club = await createClub(request, 'test-004')
  try {
    const first = await createPerson(request, club.adminToken, {
      firstName: 'Anna',
      lastName: 'Peselowa',
      pesel: PESEL_A,
      email: 'anna-peselowa@example.org',
      phone: '+48 600 000 001',
      notes: 'Allergy: none recorded',
    })
    const second = await createPerson(request, club.adminToken, { firstName: 'Bartek', lastName: 'Peselowy' })

    // The phone, the e-mail and the notes are ciphertext in the database, and come back decrypted to the administrator.
    const raw = await rawPerson(first)
    expect(raw?.phone).toBeTruthy()
    expect(raw?.phone).not.toContain('600 000 001')
    expect(raw?.email).not.toBe('anna-peselowa@example.org')
    expect(raw?.notes).not.toContain('Allergy')
    const asAdmin = await getPerson(request, club.adminToken, first)
    expect(asAdmin.body).toMatchObject({
      access: 'full',
      pesel: PESEL_A,
      email: 'anna-peselowa@example.org',
      phone: '+48 600 000 001',
      notes: 'Allergy: none recorded',
    })

    // The same PESEL entered on another record through an update → 409; the first record keeps its PESEL.
    const secondDetail = await getPerson(request, club.adminToken, second)
    const duplicate = await call<{ code?: string }>(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: second, pesel: PESEL_A },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(secondDetail.body?.updatedAt) },
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body?.code).toBe('pesel_duplicate')
    expect((await getPerson(request, club.adminToken, first)).body?.pesel).toBe(PESEL_A)
    expect((await getPerson(request, club.adminToken, second)).body?.pesel).toBeNull()

    // A cleared PESEL (and its lookup hash) is free for another record.
    const cleared = await call(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: first, pesel: null },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(asAdmin.body?.updatedAt) },
    })
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect((await rawPerson(first))?.pesel_hash).toBeNull()
    const reused = await call(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: second, pesel: PESEL_A },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(secondDetail.body?.updatedAt) },
    })
    expect(reused.status, JSON.stringify(reused.body)).toBe(200)
    const restored = await getPerson(request, club.adminToken, first)
    const backToFirst = await call<{ code?: string }>(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: first, pesel: PESEL_A },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(restored.body?.updatedAt) },
    })
    expect(backToFirst.status).toBe(409)
    const withOther = await call(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: first, pesel: PESEL_B },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(restored.body?.updatedAt) },
    })
    expect(withOther.status, JSON.stringify(withOther.body)).toBe(200)

    // A coordinator (people.view without people.pesel.view) reads another person: basic data only.
    const coordinator = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Koordynatorka',
      birthDate: birthDateTurning(33),
    })
    await assignRole(request, club.adminToken, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId: '55555555-5555-4555-8555-555555555555',
      validFrom: '2020-01-01',
    })
    const token = await signInAs(request, club, coordinator.userId, coordinator.email)
    const other = await getPerson(request, token, first)
    expect(other.status).toBe(200)
    expect(other.body?.access).toBe('basic')
    for (const field of SENSITIVE_PERSON_FIELDS) expect(other.body).not.toHaveProperty(field)
    const body = JSON.stringify(other.body)
    for (const secret of [PESEL_B, 'anna-peselowa@example.org', '600 000 001', 'Allergy']) {
      expect(body).not.toContain(secret)
    }
    const listed = await persons(request, token)
    for (const secret of [PESEL_A, PESEL_B, 'anna-peselowa@example.org', '600 000 001', 'Allergy']) {
      expect(listed.raw).not.toContain(secret)
    }
  } finally {
    await club.cleanup()
  }
})
