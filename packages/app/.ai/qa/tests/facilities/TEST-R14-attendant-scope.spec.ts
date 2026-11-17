import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, readNotifications, zoneInstant } from '../_fixtures/activities'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, createSecondOrganization } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  ORLIK_HOURS,
  bulkAvailability,
  getRental,
  listRentals,
  phoneRental,
  postEntryBan,
  postRate,
  postRental,
  readRental,
  rentalPitch,
  runRequestProbe,
  setOpeningHours,
  type CodedError,
} from '../_fixtures/facilities'
import { signedInStaff } from '../_fixtures/groups'

// Issue #282 (E11-S08), facilities parity spec phase 8, TEST-R14 (REQ-R14, AC-R10; the phase-12 cancellation preview
// is not part of this phase): the attendant of Boisko A reads and writes nothing of Boisko B — the place options, the
// renter search, the calendar, "today", a rental's read, its correction and every status action, the incidents and
// the entry bans answer 403 `scope_denied`, 404 or an empty list, and Boisko B's rental stays as it was. A coach reads
// today's rental without its contact. The administrator of a second club reads none of the first club's rows. An
// incident with an entry ban request notifies the administrators once — saving it again sends nothing — and an
// incident that gets the request later notifies them then; the notice names no contact and no description.
test.describe.configure({ timeout: 300_000 })

type List<T> = { items?: T[] }
type TodayEntry = { id: string; kind: string; contactName: string | null; contactPhone: string | null }
type Today = CodedError & { entries?: TodayEntry[] }
type Incident = CodedError & { id?: string; updatedAt?: string }

function expectRefused(result: { status: number; body: CodedError | null }, label: string) {
  expect([403, 404], `${label} ${JSON.stringify(result.body)}`).toContain(result.status)
  if (result.status === 403) expect(result.body?.code, label).toBe('scope_denied')
}

test('TEST-R14 attendant scope: pitch B refused everywhere, coach without contact, other club, ban request once', async ({
  request,
}) => {
  const club = await createClub(request, 'test-r14-scope')
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

    // A rental on each pitch next Saturday, and one of today on Boisko A with a contact.
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const onA = await postRental(request, admin, phoneRental(pitchA, setup.neighbours, zoneInstant(saturday, '10:00')))
    expect(onA.status, JSON.stringify(onA.body)).toBe(201)
    const onB = await postRental(request, admin, phoneRental(pitchB, setup.neighbours, zoneInstant(saturday, '10:00')))
    expect(onB.status, JSON.stringify(onB.body)).toBe(201)
    const rentalA = String(onA.body?.id)
    const rentalB = String(onB.body?.id)
    const todayRental = String(
      runRequestProbe(club, {
        op: 'rental',
        placeId: pitchA,
        startsAt: zoneInstant(today, '12:00'),
        endsAt: zoneInstant(today, '13:30'),
        renterId: setup.neighbours,
        renterDisplayName: 'KS Sąsiedzi',
        contactName: 'Jan Kontakt',
        contactPhone: '600 000 001',
      }).id,
    )

    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Gospodarz',
      role: 'facility_operator',
      placeId: pitchA,
    })
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Nowak', role: 'coach' })
    const token = attendant.token

    // Options, renters, calendar, today: Boisko B is not the attendant's.
    const options = await call<List<{ id: string }>>(request, 'GET', '/api/facilities/options/places', token)
    expect(options.status, JSON.stringify(options.body)).toBe(200)
    const optionIds = (options.body?.items ?? []).map((item) => item.id)
    expect(optionIds).toContain(pitchA)
    expect(optionIds).not.toContain(pitchB)
    expectRefused(
      await call<CodedError>(request, 'GET', `/api/facilities/renters?search=S%C4%85s&placeId=${pitchB}`, token),
      'renters on B',
    )
    const window = `from=${zoneInstant(saturday, '00:00')}&to=${zoneInstant(addDays(saturday, 1), '00:00')}`
    expectRefused(
      await call<CodedError>(request, 'GET', `/api/facilities/calendar?placeId=${pitchB}&${window}`, token),
      'calendar of B',
    )
    expectRefused(
      await call<CodedError>(request, 'GET', `/api/facilities/today?placeId=${pitchB}`, token),
      'today on B',
    )

    // Rentals: B's rental is neither listed nor read, and every write on it is refused.
    expect(await readRental(request, token, rentalB)).toBeUndefined()
    expect((await listRentals(request, token)).map((rental) => rental.id)).not.toContain(rentalB)
    expect((await listRentals(request, token)).map((rental) => rental.id)).toContain(rentalA)
    const lockB = (await getRental(request, admin, rentalB)).updatedAt
    expectRefused(
      await call<CodedError>(request, 'PUT', '/api/facilities/rentals', token, {
        data: { id: rentalB, notes: 'nie moje' },
        headers: { [OPTIMISTIC_LOCK_HEADER]: lockB },
      }),
      'correct B',
    )
    for (const [action, data] of [
      ['confirm', {}],
      ['cancel', {}],
      ['no-show', {}],
      ['move', { placeId: pitchB, startsAt: zoneInstant(saturday, '14:00') }],
    ] as const) {
      expectRefused(
        await call<CodedError>(request, 'POST', `/api/facilities/rentals/${rentalB}/${action}`, token, {
          data,
          headers: { [OPTIMISTIC_LOCK_HEADER]: lockB },
        }),
        `${action} B`,
      )
    }
    expect(await getRental(request, admin, rentalB)).toMatchObject({ status: 'requested', notes: null })

    // Incidents and bans: nothing on B; the ban itself stays the administrator's (J-R08 step 4).
    const incidentsB = await call<List<unknown> & CodedError>(
      request,
      'GET',
      `/api/facilities/incidents?placeId=${pitchB}`,
      token,
    )
    if (incidentsB.status === 200) expect(incidentsB.body?.items ?? []).toEqual([])
    else expectRefused(incidentsB, 'incidents of B')
    expectRefused(
      await call<CodedError>(request, 'POST', '/api/facilities/incidents', token, {
        data: {
          placeId: pitchB,
          occurredAt: new Date().toISOString(),
          kind: 'damage',
          description: 'Zgłoszenie z cudzego boiska',
          actionTaken: ['entry_ban_requested'],
        },
      }),
      'incident on B',
    )
    expectRefused(
      await postEntryBan(request, token, {
        placeId: pitchA,
        subjectType: 'institution',
        subjectId: setup.neighbours,
        startsOn: today,
        reason: 'Bójka',
      }),
      'entry ban by the attendant',
    )

    // A coach reads today's rental on A without its contact (DD-R18); the attendant with it.
    const coachToday = await call<Today>(request, 'GET', `/api/facilities/today?placeId=${pitchA}`, coach.token)
    expect(coachToday.status, JSON.stringify(coachToday.body)).toBe(200)
    expect(coachToday.body?.entries?.find((entry) => entry.id === todayRental)).toMatchObject({
      contactName: null,
      contactPhone: null,
    })
    const attendantToday = await call<Today>(request, 'GET', `/api/facilities/today?placeId=${pitchA}`, token)
    expect(attendantToday.body?.entries?.find((entry) => entry.id === todayRental)).toMatchObject({
      contactName: 'Jan Kontakt',
      contactPhone: '600 000 001',
    })

    // A second club's administrator reads and writes none of these rows.
    const other = await createSecondOrganization(request, club)
    expect(await readRental(request, other.adminToken, rentalA)).toBeUndefined()
    const foreignPut = await call<CodedError>(request, 'PUT', '/api/facilities/rentals', other.adminToken, {
      data: { id: rentalA, notes: 'obcy klub' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: (await getRental(request, admin, rentalA)).updatedAt },
    })
    expect([403, 404], JSON.stringify(foreignPut.body)).toContain(foreignPut.status)
    const foreignToday = await call<CodedError>(
      request,
      'GET',
      `/api/facilities/today?placeId=${pitchA}`,
      other.adminToken,
    )
    expect([403, 404], JSON.stringify(foreignToday.body)).toContain(foreignToday.status)
    expect((await getRental(request, admin, rentalA)).notes ?? null).toBeNull()

    // The ban request: one notice per incident, however often it is saved.
    const description = 'Bójka po meczu przy lewej bramce, sędzia przerwał grę'
    const requested = await call<Incident>(request, 'POST', '/api/facilities/incidents', token, {
      data: {
        placeId: pitchA,
        occurredAt: new Date().toISOString(),
        kind: 'rules_violation',
        description,
        involved: 'KS Sąsiedzi',
        actionTaken: ['entry_ban_requested'],
      },
    })
    expect(requested.status, JSON.stringify(requested.body)).toBe(201)
    const requestedId = String(requested.body?.id)
    const banNotices = async (incidentId: string) =>
      (await readNotifications(request, admin)).filter(
        (item) => item.type === 'facilities.entry_ban_requested' && item.sourceEntityId === incidentId,
      )
    await expect.poll(async () => (await banNotices(requestedId)).length, { timeout: 60_000 }).toBe(1)
    const notice = JSON.stringify(await banNotices(requestedId))
    expect(notice).not.toContain('600 000 001')
    expect(notice).not.toContain('Jan Kontakt')
    expect(notice).not.toContain(description)
    expect(await readNotifications(request, attendant.token)).not.toContainEqual(
      expect.objectContaining({ type: 'facilities.entry_ban_requested' }),
    )
    const saved = await call<Incident>(request, 'PUT', '/api/facilities/incidents', token, {
      data: { id: requestedId, actionTaken: ['warning_given', 'entry_ban_requested'] },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(requested.body?.updatedAt) },
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)

    // An incident without the request notifies nobody until the request is added.
    const plain = await call<Incident>(request, 'POST', '/api/facilities/incidents', token, {
      data: {
        placeId: pitchA,
        occurredAt: new Date().toISOString(),
        kind: 'damage',
        description: 'Rozdarta siatka w prawej bramce',
        actionTaken: ['warning_given'],
      },
    })
    expect(plain.status, JSON.stringify(plain.body)).toBe(201)
    const plainId = String(plain.body?.id)
    const added = await call<Incident>(request, 'PUT', '/api/facilities/incidents', token, {
      data: { id: plainId, actionTaken: ['warning_given', 'entry_ban_requested'] },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(plain.body?.updatedAt) },
    })
    expect(added.status, JSON.stringify(added.body)).toBe(200)
    await expect.poll(async () => (await banNotices(plainId)).length, { timeout: 60_000 }).toBe(1)
    // The second save of the first incident sent nothing more.
    expect(await banNotices(requestedId)).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
