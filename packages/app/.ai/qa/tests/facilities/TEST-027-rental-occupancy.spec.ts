import { expect, test } from '@playwright/test'
import {
  addDays,
  createActivity,
  createEvent,
  getActivity,
  juneThirtiethNextYear,
  nextWeekday,
  updateActivity,
  zoneInstant,
} from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import { getRental, phoneRental, postClosure, postRental, rentalPitch } from '../_fixtures/facilities'

// Issue #122 (E08-S02), facilities spec REQ-013, DD-20, DD-43, TEST-027 and TEST-058 (b): a rental occupies its slot
// for sessions through `vereino.occupancyProvider` — a session saved onto a rented slot answers 409
// `occurrence_place_conflict` with the reason `rental`; a closure over a rental flags it to be moved and counts it; a
// rental and a session saved at the same time on the same slot never both succeed (the shared occupancy lock).
test.describe.configure({ timeout: 300_000 })

test('TEST-027 a rented slot refuses a session; a closure flags the rental', async ({ request }) => {
  const club = await createClub(request, 'test-027-rentals')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const thursday = nextWeekday(addDays(calendarDate(), 7), 'TH')
    const rental = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(thursday, '19:30')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)

    const session = await createEvent(request, setup.coordinator, {
      groupId: setup.orliki,
      type: 'tournament',
      name: 'Turniej Orlików',
      placeId: setup.pitch,
      startsAt: zoneInstant(thursday, '20:00'),
      endsAt: zoneInstant(thursday, '21:00'),
    })
    expect(session.status, JSON.stringify(session.body)).toBe(409)
    expect(session.body?.code).toBe('occurrence_place_conflict')
    const blocks = session.body?.conflicts?.flatMap((conflict) => conflict.blocks) ?? []
    expect(blocks).toContainEqual(expect.objectContaining({ id: rental.body?.id, reason: 'rental' }))

    // A closure over the rental marks it to be moved and counts it.
    const closure = await postClosure(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(thursday, '18:00'),
      endsAt: zoneInstant(thursday, '22:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    expect(closure.body?.flagged).toEqual({ sessions: 0, rentals: 1, bookings: 0 })
    expect((await getRental(request, admin, String(rental.body?.id))).needsReschedule).toBe(true)
  } finally {
    await club.cleanup()
  }
})

test('TEST-058 (b) a rental and a session saved at once on one slot: exactly one succeeds', async ({ request }) => {
  const club = await createClub(request, 'test-058-sessions')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const monday = nextWeekday(addDays(calendarDate(), 7), 'MO')
    for (const [round, time] of ['08:00', '09:30', '11:00', '12:30', '14:00'].entries()) {
      const startsAt = zoneInstant(monday, time)
      const [rental, session] = await Promise.all([
        postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, startsAt)),
        createEvent(request, setup.coordinator, {
          groupId: setup.orliki,
          type: 'tournament',
          name: `Turniej ${String(round)}`,
          placeId: setup.pitch,
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + 60 * 60_000).toISOString(),
        }),
      ])
      const won = [rental.status, session.status].filter((status) => status === 201)
      expect(won, `round ${String(round)}: ${JSON.stringify([rental.body, session.body])}`).toHaveLength(1)
      if (rental.status === 201) expect(session.body?.code).toBe('occurrence_place_conflict')
      else expect(rental.body?.code).toBe('rental_conflict')
    }
  } finally {
    await club.cleanup()
  }
})

test('TEST-027 a series edit that keeps a flagged session in place is not refused by the closure over it', async ({
  request,
}) => {
  const club = await createClub(request, 'test-027-series')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const { id: activityId } = await createActivity(request, setup.coordinator, {
      groupId: setup.orliki,
      name: 'Trening Orlików',
      type: 'training',
      placeId: setup.pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const tuesday = nextWeekday(addDays(today, 7), 'TU')
    const closure = await postClosure(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(tuesday, '16:00'),
      endsAt: zoneInstant(tuesday, '20:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    expect(closure.body?.flagged?.sessions).toBe(1)

    // A rename keeps every session where it is: the flagged session stays for the coordinator to resolve.
    const before = await getActivity(request, setup.coordinator, activityId)
    const renamed = await updateActivity(
      request,
      setup.coordinator,
      { id: activityId, name: 'Trening Orlików U10' },
      before.body?.updatedAt,
    )
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)

    // Moving the times moves that session too, into the closure: refused with the reason `closure`.
    const after = await getActivity(request, setup.coordinator, activityId)
    const moved = await updateActivity(
      request,
      setup.coordinator,
      { id: activityId, startTime: '17:30', endTime: '19:00' },
      after.body?.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(409)
    expect(moved.body?.code).toBe('occurrence_place_conflict')
    const blocks = moved.body?.conflicts?.flatMap((conflict) => conflict.blocks) ?? []
    expect(blocks).toContainEqual(expect.objectContaining({ id: closure.body?.id, reason: 'closure' }))
  } finally {
    await club.cleanup()
  }
})
