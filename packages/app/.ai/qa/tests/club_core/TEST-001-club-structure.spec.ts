import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { OPTIMISTIC_LOCK_HEADER, call, createClub } from '../_fixtures/club'
import { create, getOne, list, remove, update } from '../_fixtures/club-structure'

// TEST-001 (club spec; issue #25): CRUD of sections, places (hierarchy), institutions and the settings by the club
// administrator — save, read, clearing fields to null, 422 on a hierarchy cycle (glossary *Place*), 409 on a stale
// version; encrypted institution and place fields are ciphertext in the database and plaintext in the API.
test.describe.configure({ timeout: 300_000 })

const STALE = '2000-01-01T00:00:00.000Z'

type Settings = Record<string, unknown> & { updatedAt?: string | null; code?: string }

test('TEST-001 club settings: save, read, clear and stale version', async ({ request }) => {
  const club = await createClub(request, 'test-001-settings')
  try {
    const read = () => call<Settings>(request, 'GET', '/api/club_core/settings', club.adminToken)
    const saved = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
      data: {
        shortName: 'Dev Academy',
        currency: 'EUR',
        declarationKinds: { training: 'confirm' },
        onlineFeeMode: 'payer_pays',
        onlineFeePercent: 1.5,
        onlineFeeFixed: 100,
        coachSettlementModel: 'fixed_base_adjusted',
        showCalledUpChildren: 'consented',
      },
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const stored = await read()
    expect(stored.body).toMatchObject({
      shortName: 'Dev Academy',
      currency: 'EUR',
      declarationKinds: { training: 'confirm', match: 'confirm', sparring: 'confirm' },
      onlineFeeMode: 'payer_pays',
      onlineFeePercent: 1.5,
      onlineFeeFixed: 100,
      coachSettlementModel: 'fixed_base_adjusted',
      showCalledUpChildren: 'consented',
      orderSalesDocument: 'none',
    })
    const token = String(stored.body?.updatedAt)

    // Clearing the short name to null with the current version.
    const cleared = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
      data: { shortName: null },
      headers: { [OPTIMISTIC_LOCK_HEADER]: token },
    })
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect((await read()).body?.shortName).toBeNull()

    // A stale version, an unavailable sales document and an unknown activity type are refused.
    const stale = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, {
      data: { currency: 'PLN' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: STALE },
    })
    expect(stale.status).toBe(409)
    for (const data of [{ orderSalesDocument: 'receipt' }, { declarationKinds: { lesson: 'confirm' } }]) {
      const refused = await call<Settings>(request, 'PUT', '/api/club_core/settings', club.adminToken, { data })
      expect(refused.status, JSON.stringify(data)).toBe(400)
    }
  } finally {
    await club.cleanup()
  }
})

test('TEST-001 sections: create, read, clear, stale version, delete', async ({ request }) => {
  const club = await createClub(request, 'test-001-sections')
  try {
    const id = await create(request, club.adminToken, 'sections', {
      name: 'Akademia piłkarska',
      description: 'Sekcja główna',
    })
    const created = await getOne(request, club.adminToken, 'sections', id)
    expect(created).toMatchObject({ name: 'Akademia piłkarska', description: 'Sekcja główna', isActive: true })

    const cleared = await update(request, club.adminToken, 'sections', { id, description: null }, created?.updatedAt)
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    const afterClear = await getOne(request, club.adminToken, 'sections', id)
    expect(afterClear?.description).toBeNull()

    const stale = await update(request, club.adminToken, 'sections', { id, name: 'Basen' }, STALE)
    expect(stale.status).toBe(409)
    const invalid = await update(request, club.adminToken, 'sections', { id, name: '' }, afterClear?.updatedAt)
    expect(invalid.status).toBe(400)

    const staleDelete = await remove(request, club.adminToken, 'sections', id, STALE)
    expect(staleDelete.status).toBe(409)
    const deleted = await remove(request, club.adminToken, 'sections', id, afterClear?.updatedAt)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    expect(await getOne(request, club.adminToken, 'sections', id)).toBeUndefined()
  } finally {
    await club.cleanup()
  }
})

test('TEST-001 institutions: encrypted contact and bank account, clear, stale version', async ({ request }) => {
  const club = await createClub(request, 'test-001-institutions')
  try {
    const id = await create(request, club.adminToken, 'institutions', {
      name: 'Gmina Testowo',
      type: 'municipality',
      contactName: 'Anna Urzędniczka',
      contactEmail: 'anna@example.org',
      bankAccount: 'PL61109010140000071219812874',
      notes: 'Umowa użyczenia Orlika',
    })
    const created = await getOne(request, club.adminToken, 'institutions', id)
    expect(created).toMatchObject({
      name: 'Gmina Testowo',
      type: 'municipality',
      contactName: 'Anna Urzędniczka',
      bankAccount: 'PL61109010140000071219812874',
      notes: 'Umowa użyczenia Orlika',
    })
    const raw = await withClient(async (client) => {
      const result = await client.query<{ bank_account: string | null; contact_name: string | null }>(
        'select bank_account, contact_name from club_core_institutions where id = $1',
        [id],
      )
      return result.rows[0]
    })
    expect(raw.bank_account).toBeTruthy()
    expect(raw.bank_account).not.toContain('PL611090')
    expect(raw.contact_name).not.toContain('Anna')

    const cleared = await update(
      request,
      club.adminToken,
      'institutions',
      { id, notes: null, bankAccount: '' },
      created?.updatedAt,
    )
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    const afterClear = await getOne(request, club.adminToken, 'institutions', id)
    expect(afterClear).toMatchObject({ notes: null, bankAccount: null, contactName: 'Anna Urzędniczka' })

    const stale = await update(request, club.adminToken, 'institutions', { id, name: 'Gmina' }, STALE)
    expect(stale.status).toBe(409)
    const invalidType = await update(
      request,
      club.adminToken,
      'institutions',
      { id, type: 'bank' },
      afterClear?.updatedAt,
    )
    expect(invalidType.status).toBe(400)
  } finally {
    await club.cleanup()
  }
})

test('TEST-001 places: hierarchy, cycle 422, references, contacts, clear, stale version, delete rules', async ({
  request,
}) => {
  const club = await createClub(request, 'test-001-places')
  try {
    const token = club.adminToken
    const municipality = await create(request, token, 'institutions', { name: 'Gmina Testowo', type: 'municipality' })
    const orlik = await create(request, token, 'places', {
      name: 'Orlik 2024',
      kind: 'complex',
      ownerInstitutionId: municipality,
      managedByClub: true,
      geoLat: 52.229676,
      geoLng: 21.012229,
      contacts: [{ role: 'Gospodarz', name: 'Jan Nowak', phone: '+48 600 100 200' }],
    })
    const pitch = await create(request, token, 'places', {
      name: 'Boisko piłkarskie',
      kind: 'pitch',
      parentPlaceId: orlik,
    })
    const lockers = await create(request, token, 'places', {
      name: 'Zaplecze szatniowe',
      kind: 'locker_room',
      parentPlaceId: pitch,
    })

    const complex = await getOne(request, token, 'places', orlik)
    expect(complex).toMatchObject({
      name: 'Orlik 2024',
      kind: 'complex',
      parentPlaceId: null,
      ownerInstitutionId: municipality,
      capacityGroups: 1,
      geoLat: 52.229676,
      contacts: [{ role: 'Gospodarz', name: 'Jan Nowak', phone: '+48 600 100 200' }],
    })
    expect((await getOne(request, token, 'places', lockers))?.parentPlaceId).toBe(pitch)
    const children = await list(request, token, 'places', `&parentPlaceId=${orlik}`)
    expect(children.items.map((item) => item.id)).toEqual([pitch])

    // The contacts are ciphertext at rest.
    const rawContacts = await withClient(async (client) => {
      const result = await client.query<{ contacts: string | null }>(
        'select contacts from club_core_places where id = $1',
        [orlik],
      )
      return result.rows[0]?.contacts ?? null
    })
    expect(rawContacts).toBeTruthy()
    expect(rawContacts).not.toContain('Jan Nowak')

    // Cycles: the complex under itself, under its child and under its grandchild → 422.
    for (const parentPlaceId of [orlik, pitch, lockers]) {
      const cycle = await update(request, token, 'places', { id: orlik, parentPlaceId }, complex?.updatedAt)
      expect(cycle.status, JSON.stringify(cycle.body)).toBe(422)
      expect(cycle.body?.code).toBe('place_hierarchy_cycle')
    }
    // An unknown parent or owner → 422 `place_reference_invalid`; capacity below 1 → 400.
    const pitchToken = (await getOne(request, token, 'places', pitch))?.updatedAt
    const unknown = await update(
      request,
      token,
      'places',
      { id: pitch, parentPlaceId: '00000000-0000-4000-8000-000000000000' },
      pitchToken,
    )
    expect(unknown.status).toBe(422)
    expect(unknown.body?.code).toBe('place_reference_invalid')
    const zeroCapacity = await update(request, token, 'places', { id: pitch, capacityGroups: 0 }, pitchToken)
    expect(zeroCapacity.status).toBe(400)

    // Clearing the description, the coordinates and the contacts.
    const cleared = await update(
      request,
      token,
      'places',
      { id: orlik, description: null, geoLat: null, contacts: null },
      complex?.updatedAt,
    )
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect(await getOne(request, token, 'places', orlik)).toMatchObject({
      description: null,
      geoLat: null,
      contacts: [],
    })
    const stale = await update(request, token, 'places', { id: orlik, name: 'Orlik' }, STALE)
    expect(stale.status).toBe(409)

    // A place with children and an institution that owns a place are not deleted (409).
    const current = await getOne(request, token, 'places', orlik)
    const withChildren = await remove(request, token, 'places', orlik, current?.updatedAt)
    expect(withChildren.status).toBe(409)
    expect(withChildren.body?.code).toBe('place_has_children')
    const owner = await getOne(request, token, 'institutions', municipality)
    const inUse = await remove(request, token, 'institutions', municipality, owner?.updatedAt)
    expect(inUse.status).toBe(409)
    expect(inUse.body?.code).toBe('institution_in_use')

    // Leaves first, then the complex.
    for (const id of [lockers, pitch, orlik]) {
      const row = await getOne(request, token, 'places', id)
      const deleted = await remove(request, token, 'places', id, row?.updatedAt)
      expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    }
    expect((await list(request, token, 'places')).items).toEqual([])
  } finally {
    await club.cleanup()
  }
})
