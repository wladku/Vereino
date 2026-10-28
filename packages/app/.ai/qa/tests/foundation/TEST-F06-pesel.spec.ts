import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  assignRole,
  birthDateTurning,
  call,
  createClub,
  createPerson,
  createStaff,
  getPerson,
  signInAs,
} from '../_fixtures/club'

// TEST-F06 (foundation spec P-09; club spec TEST-004): the PESEL declared with `encryptedField` is ciphertext in the
// database with a lookup hash, deduplicated by that hash (409), validated (422), returned only with
// `people.pesel.view`, and a person is found by surname through the platform's search tokens.
test.describe.configure({ timeout: 300_000 })

// Synthetic numbers with valid check digits (engineering standards S5.9: no real PESEL in test data).
const PESEL = '90010100009'
const OTHER_PESEL = '85020300017'

type PersonRow = { pesel: string | null; pesel_hash: string | null; last_name: string | null }

async function rawPerson(id: string): Promise<PersonRow | undefined> {
  return withClient(async (client) => {
    const { rows } = await client.query<PersonRow>(
      'select pesel, pesel_hash, last_name from people_persons where id = $1',
      [id],
    )
    return rows[0]
  })
}

test('TEST-F06 PESEL: encrypted, deduplicated, validated, hidden without people.pesel.view, name search', async ({
  request,
}) => {
  const club = await createClub(request, 'test-f06')
  try {
    const personId = await createPerson(request, club.adminToken, {
      firstName: 'Paweł',
      lastName: 'Kowalczyk',
      pesel: PESEL,
    })

    // Ciphertext and a lookup hash in the database; never the plaintext.
    const raw = await rawPerson(personId)
    expect(raw?.pesel).toBeTruthy()
    expect(raw?.pesel).not.toBe(PESEL)
    expect(raw?.pesel_hash).toBeTruthy()
    expect(raw?.last_name).not.toBe('Kowalczyk')

    // Same PESEL again → 409 (hash lookup); a malformed one → 422.
    const duplicate = await call(request, 'POST', '/api/people/persons', club.adminToken, {
      data: { firstName: 'Inny', lastName: 'Człowiek', pesel: PESEL },
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body?.code).toBe('pesel_duplicate')
    const invalid = await call(request, 'POST', '/api/people/persons', club.adminToken, {
      data: { firstName: 'Zły', lastName: 'Numer', pesel: '12345678901' },
    })
    expect(invalid.status).toBe(422)
    expect(invalid.body?.code).toBe('pesel_invalid')
    await createPerson(request, club.adminToken, { firstName: 'Drugi', lastName: 'Pesel', pesel: OTHER_PESEL })

    // The club administrator (people.* includes people.pesel.view) sees the PESEL.
    const asAdmin = await getPerson(request, club.adminToken, personId)
    expect(asAdmin.body?.pesel).toBe(PESEL)

    // A coordinator holds people.view without people.pesel.view: her own record comes back without the PESEL.
    const coordinator = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Bezpesel',
      birthDate: birthDateTurning(28),
    })
    const updated = await getPerson(request, club.adminToken, coordinator.personId)
    const withPesel = await call(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: coordinator.personId, pesel: '92071514577' },
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': String(updated.body?.updatedAt) },
    })
    expect(withPesel.status, JSON.stringify(withPesel.body)).toBe(200)
    await assignRole(request, club.adminToken, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId: '44444444-4444-4444-8444-444444444444',
      validFrom: '2020-01-01',
    })
    const coordinatorToken = await signInAs(request, club, coordinator.userId, coordinator.email)
    const own = await getPerson(request, coordinatorToken, coordinator.personId)
    expect(own.status).toBe(200)
    expect(own.body).not.toHaveProperty('pesel')
    // Lists never carry the PESEL.
    const list = await call<{ items?: Record<string, unknown>[] }>(
      request,
      'GET',
      '/api/people/persons',
      club.adminToken,
    )
    expect((list.body?.items ?? []).every((item) => !('pesel' in item))).toBe(true)

    // Search by surname reaches the encrypted column through the search tokens.
    await expect
      .poll(async () => {
        const found = await call<{ items?: { id: string }[] }>(
          request,
          'GET',
          '/api/people/persons?lastName=Kowalczyk',
          club.adminToken,
        )
        return (found.body?.items ?? []).map((item) => item.id)
      })
      .toContain(personId)
  } finally {
    await club.cleanup()
  }
})
