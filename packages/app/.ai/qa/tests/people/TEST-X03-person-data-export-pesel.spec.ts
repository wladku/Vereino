import { expect, test } from '@playwright/test'
import { call, createClub, createPerson } from '../_fixtures/club'
import { editRoleFeatures, exportPerson } from '../_fixtures/data-export'

// Person data export spec (#527, DD-X08): TEST-X03 — the export carries the PESEL only for a caller with
// `people.pesel.view`; without it the key holds the withheld marker, and no lookup hash ever leaves.
test.describe.configure({ timeout: 240_000 })

const PESEL = '90010100009'

test('TEST-X03 the PESEL is exported only with people.pesel.view', async ({ request }) => {
  const club = await createClub(request, 'test-x03-export-pesel')
  try {
    const person = await createPerson(request, club.adminToken, {
      firstName: 'Piotr',
      lastName: 'Peselowy',
      birthDate: '1990-01-01',
      pesel: PESEL,
    })
    const withPesel = await exportPerson(request, club.adminToken, person)
    expect(withPesel.status, JSON.stringify(withPesel.body)).toBe(200)
    expect(withPesel.body?.subject.pesel).toBe(PESEL)
    expect(Object.keys(withPesel.body?.subject ?? {})).not.toContain('peselHash')

    // The administrator's role without `people.pesel.view` (the wildcard replaced by the features the export needs).
    await editRoleFeatures(request, club, 'vereino_club_admin', (features) => [
      ...features.filter((feature) => feature !== 'people.*'),
      'people.view',
      'people.manage',
      'people.persons.export',
    ])
    await expect
      .poll(async () => (await exportPerson(request, club.adminToken, person)).body?.subject.pesel, {
        timeout: 20_000,
      })
      .toBe('[withheld: people.pesel.view]')
    const read = await call<{ pesel?: string | null }>(request, 'GET', `/api/people/persons/${person}`, club.adminToken)
    expect(read.body?.pesel ?? null).toBeNull()
  } finally {
    await club.cleanup()
  }
})
