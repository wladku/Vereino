import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { birthDateTurning, calendarDate, call, createPerson, createClub } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  ORLIK_HOURS,
  bulkAvailability,
  phoneRental,
  postRate,
  postRental,
  rentalPitch,
  setOpeningHours,
} from '../_fixtures/facilities'
import { signedInStaff } from '../_fixtures/groups'

// Issue #277 (E11-S03), facilities parity spec phase 3, TEST-R05 (DD-R07, REQ-R14): `GET /api/facilities/renters`
// filters by the caller's facilities scope before matching. Two pitches: Boisko A (the fixture's) and Boisko B. On A
// a person of the register and an unregistered firm rented; on B another unregistered firm. Two institutions match
// the term ("KS Sąsiedzi" of the fixture, "Sąsiedzka Szkoła" that never rented), and one person of the register never
// rented. The attendant of Boisko A gets the institutions by name and only the renters of Boisko A with their last
// contact, and no person who never rented; the administrator also gets the renter of Boisko B and the person; a
// one-character term answers 400, a place outside the attendant's scope 403.
test.describe.configure({ timeout: 300_000 })

type RenterOption = {
  renterType: string
  renterId: string | null
  displayName: string
  lastCategory: string | null
  lastContact: { name: string | null; phone: string | null; email: string | null } | null
}

type Renters = { items?: RenterOption[]; total?: number; code?: string }

test('TEST-R05 renter search by scope: attendant of one pitch versus the administrator', async ({ request }) => {
  const club = await createClub(request, 'test-r05-renters')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const pitchA = setup.pitch

    // Boisko B: the same opening hours, weekend availability and an external rate.
    const pitchB = await createStructure(request, admin, 'places', { name: 'Boisko B', kind: 'pitch' })
    await setOpeningHours(request, admin, pitchB, ORLIK_HOURS)
    const bulk = await bulkAvailability(request, admin, {
      placeIds: [pitchB],
      mode: 'replace',
      validFrom: today,
      windows: [6, 7].map((weekday) => ({ weekday, from: '09:00', to: '20:30' })),
    })
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200)
    const rate = await postRate(request, admin, {
      placeId: pitchB,
      validFrom: today,
      renterCategory: 'external_commercial',
      pricePer90: 25_000,
    })
    expect(rate.status, JSON.stringify(rate.body)).toBe(201)

    // The register: a school that never rented, a person who rents on A, a person who never rented.
    await createStructure(request, admin, 'institutions', { name: 'Sąsiedzka Szkoła', type: 'school' })
    const renterPerson = await createPerson(request, admin, {
      firstName: 'Anna',
      lastName: 'Sąsiadka',
      birthDate: birthDateTurning(40),
    })
    const strangerPerson = await createPerson(request, admin, {
      firstName: 'Ryszard',
      lastName: 'Sąsiadowski',
      birthDate: birthDateTurning(45),
    })

    // Next Saturday: on A the person (10:00) and an unregistered firm (12:00); on B another firm (10:00).
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const onA = await postRental(request, admin, {
      ...phoneRental(pitchA, setup.neighbours, zoneInstant(saturday, '10:00')),
      renterType: 'person',
      renterId: renterPerson,
      contactName: 'Anna Sąsiadka',
      contactPhone: '600 100 100',
    })
    expect(onA.status, JSON.stringify(onA.body)).toBe(201)
    const firmA = await postRental(request, admin, {
      ...phoneRental(pitchA, setup.neighbours, zoneInstant(saturday, '12:00')),
      renterType: 'unregistered',
      renterId: undefined,
      renterDisplayName: 'Sąsiedzi Firma',
      contactName: 'Piotr Firma',
      contactPhone: '600 200 200',
      contactEmail: 'piotr@example.org',
    })
    expect(firmA.status, JSON.stringify(firmA.body)).toBe(201)
    const firmB = await postRental(request, admin, {
      ...phoneRental(pitchB, setup.neighbours, zoneInstant(saturday, '10:00')),
      renterType: 'unregistered',
      renterId: undefined,
      renterDisplayName: 'Sąsiedzi Tajni',
      contactName: 'Tajny Kontakt',
    })
    expect(firmB.status, JSON.stringify(firmB.body)).toBe(201)

    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Animator',
      role: 'facility_operator',
      placeId: pitchA,
    })
    const search = (token: string, query: string) =>
      call<Renters>(request, 'GET', `/api/facilities/renters?${query}`, token)
    const names = (body: Renters | null) => (body?.items ?? []).map((item) => item.displayName)

    // The attendant: institutions by name and the renters of Boisko A with the last contact; nothing of Boisko B; no
    // person who never rented.
    const byAttendant = await search(attendant.token, `search=${encodeURIComponent('sąsi')}`)
    expect(byAttendant.status, JSON.stringify(byAttendant.body)).toBe(200)
    const attendantNames = names(byAttendant.body)
    expect(attendantNames).toEqual(
      expect.arrayContaining(['Anna Sąsiadka', 'Sąsiedzi Firma', 'KS Sąsiedzi', 'Sąsiedzka Szkoła']),
    )
    expect(attendantNames).not.toContain('Sąsiedzi Tajni')
    expect(attendantNames).not.toContain('Ryszard Sąsiadowski')
    const firm = byAttendant.body?.items?.find((item) => item.displayName === 'Sąsiedzi Firma')
    expect(firm).toEqual({
      renterType: 'unregistered',
      renterId: null,
      displayName: 'Sąsiedzi Firma',
      lastCategory: 'external_commercial',
      lastContact: { name: 'Piotr Firma', phone: '600 200 200', email: 'piotr@example.org' },
    })
    expect(byAttendant.body?.items?.find((item) => item.displayName === 'Anna Sąsiadka')).toMatchObject({
      renterType: 'person',
      renterId: renterPerson,
      lastContact: { phone: '600 100 100' },
    })
    // An institution result carries the name only: no contact and no category without a rental.
    expect(byAttendant.body?.items?.find((item) => item.displayName === 'Sąsiedzka Szkoła')).toMatchObject({
      renterType: 'institution',
      lastCategory: null,
      lastContact: null,
    })

    // The administrator: the renter of Boisko B and, with `people.view`, the person who never rented.
    await expect
      .poll(async () => names((await search(admin, `search=${encodeURIComponent('sąsiad')}`)).body))
      .toContain('Ryszard Sąsiadowski')
    const byAdmin = await search(admin, `search=${encodeURIComponent('sąsi')}`)
    expect(byAdmin.status).toBe(200)
    expect(names(byAdmin.body)).toEqual(expect.arrayContaining(['Sąsiedzi Tajni', 'Sąsiedzi Firma', 'KS Sąsiedzi']))
    expect(
      (await search(admin, `search=${encodeURIComponent('Ryszard')}`)).body?.items?.find(
        (item) => item.renterId === strangerPerson,
      ),
    ).toMatchObject({ renterType: 'person', lastContact: null })

    // `placeId` narrows the history; a place outside the attendant's scope is refused.
    const onlyB = await search(admin, `search=${encodeURIComponent('sąsiedzi')}&placeId=${pitchB}`)
    expect(names(onlyB.body)).toContain('Sąsiedzi Tajni')
    expect(names(onlyB.body)).not.toContain('Sąsiedzi Firma')
    const foreign = await search(attendant.token, `search=${encodeURIComponent('sąsi')}&placeId=${pitchB}`)
    expect(foreign.status).toBe(403)
    expect(foreign.body?.code).toBe('scope_denied')

    // A one-character term and an overlong one answer 400.
    expect((await search(attendant.token, 'search=s')).status).toBe(400)
    expect((await search(admin, `search=${'x'.repeat(81)}`)).status).toBe(400)
    // A coach without `facilities.rentals.manage` is refused by the route's feature gate.
    const coach = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    expect((await search(coach.token, 'search=ks')).status).toBe(403)
  } finally {
    await club.cleanup()
  }
})
