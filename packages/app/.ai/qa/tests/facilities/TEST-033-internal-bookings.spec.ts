import { expect, test } from '@playwright/test'
import { addDays, createEvent, listOccurrences, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  cancelInternalBooking,
  phoneRental,
  postClosure,
  postInternalBooking,
  postRental,
  postZoneRule,
  rentalPitch,
  runRequestProbe,
  staffCalendar,
} from '../_fixtures/facilities'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'

// Issue #123 (E08-S03), facilities spec REQ-023, R06, J-006, TEST-033 and TEST-058 (c, internal booking against a
// rental): staff of two sections book club places at once, without approval, in any zone; "For a group" is a one-off
// event of `activities` whose session occupies the pitch; an occupied slot answers 409 with the conflicts and their
// names, a closure or a time outside the opening hours 409 `place_closed`; a group the coach does not coach 403; the
// booker, the section's coordinator or the administrator cancels, an unrelated coach gets 403; a club booking — and a
// group event — supersedes an external request holding the slot. The online request flow is E08-S05, so the held
// request is stored by the QA probe.
test.describe.configure({ timeout: 300_000 })

test('TEST-033 coaches book at once in any zone; conflicts, closures and opening hours refuse; cancellation and supersession', async ({
  request,
}) => {
  const club = await createClub(request, 'test-033-bookings')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const fitness = await createStructure(request, admin, 'sections', { name: 'Fitness' })
    const zumba = await createGroup(request, admin, { sectionId: fitness, name: 'Zumba dorośli', kind: 'class_group' })
    const hall = await createStructure(request, admin, 'places', { name: 'Salka szkoleniowa', kind: 'hall' })
    // The hall is open to the public on Tuesdays (no opening-hours limit): an internal booking ignores the zone.
    const publicZone = await postZoneRule(request, admin, {
      placeId: hall,
      weekdays: [2],
      timeFrom: '16:00',
      timeTo: '22:00',
      zone: 'public_free',
      priority: 1,
      validFrom: today,
    })
    expect(publicZone.status, JSON.stringify(publicZone.body)).toBe(201)

    const wojtek = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: wojtek.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    const ola = await signedInStaff(request, club, { firstName: 'Ola', lastName: 'Instruktorka', role: 'coach' })
    await addMembership(request, admin, {
      groupId: zumba,
      personId: ola.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })

    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const sunday = addDays(saturday, 1)
    const monday = addDays(saturday, 2)
    const tuesday = addDays(saturday, 3)
    const wednesday = addDays(saturday, 4)

    // A held external request on Saturday 10:00–11:30 (stands in for E08-S05).
    const saturdayRequest = String(
      runRequestProbe(club, {
        op: 'seed',
        placeId: setup.pitch,
        startsAt: zoneInstant(saturday, '10:00'),
        endsAt: zoneInstant(saturday, '11:30'),
      }).id,
    )

    // AC 1 — "For a group": Wojtek books Saturday 9:00–12:00 for Żaki as a tournament; the event is in the group's
    // sessions and on the pitch's timeline, and the held request is superseded.
    const tournament = await createEvent(request, wojtek.token, {
      groupId: setup.zaki,
      type: 'tournament',
      name: 'Turniej o Puchar Gwiazdy',
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '09:00'),
      endsAt: zoneInstant(saturday, '12:00'),
    })
    expect(tournament.status, JSON.stringify(tournament.body)).toBe(201)
    const sessions = await listOccurrences(request, admin, `&groupId=${setup.zaki}`)
    expect(sessions.items.map((session) => session.id)).toContain(tournament.body?.occurrenceId)
    const saturdayView = await staffCalendar(
      request,
      wojtek.token,
      `placeId=${setup.pitch}&from=${encodeURIComponent(zoneInstant(saturday, '00:00'))}&to=${encodeURIComponent(zoneInstant(sunday, '00:00'))}`,
    )
    expect(saturdayView.status, JSON.stringify(saturdayView.body)).toBe(200)
    expect(saturdayView.body?.days?.[0]?.opening).toEqual([{ from: '09:00', to: '20:30' }])
    expect(saturdayView.body?.days?.[0]?.zones.map((zone) => zone.zone)).toContain('reservable_paid')
    expect(saturdayView.body?.entries).toContainEqual(
      expect.objectContaining({
        id: tournament.body?.occurrenceId,
        kind: 'session',
        label: 'Turniej o Puchar Gwiazdy',
      }),
    )
    await expect
      .poll(() => runRequestProbe(club, { op: 'status', id: saturdayRequest }).status, { timeout: 30_000 })
      .toBe('superseded')

    // AC 4 — a group outside the coach's scope: 403.
    const outside = await createEvent(request, wojtek.token, {
      groupId: setup.orliki,
      type: 'tournament',
      name: 'Turniej Orlików',
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '13:00'),
      endsAt: zoneInstant(saturday, '14:00'),
    })
    expect(outside.status, JSON.stringify(outside.body)).toBe(403)

    // AC 2 — the slot taken: 409 with the conflicts and their names (staff).
    const taken = await postInternalBooking(request, wojtek.token, {
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '10:00'),
      endsAt: zoneInstant(saturday, '11:00'),
      sectionId: setup.academy,
      purpose: 'Rozgrzewka',
    })
    expect(taken.status, JSON.stringify(taken.body)).toBe(409)
    expect(taken.body?.code).toBe('rental_conflict')
    expect(taken.body?.conflicts).toContainEqual(
      expect.objectContaining({ kind: 'session', label: 'Turniej o Puchar Gwiazdy' }),
    )

    // AC 3 — outside the opening hours (Saturday opens at 9:00) and during a closure: 409 `place_closed`.
    const early = await postInternalBooking(request, wojtek.token, {
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '08:00'),
      endsAt: zoneInstant(saturday, '09:00'),
      sectionId: setup.academy,
      purpose: 'Rozgrzewka',
    })
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('place_closed')
    const closure = await postClosure(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(wednesday, '10:00'),
      endsAt: zoneInstant(wednesday, '14:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    const closed = await postInternalBooking(request, wojtek.token, {
      placeId: setup.pitch,
      startsAt: zoneInstant(wednesday, '11:00'),
      endsAt: zoneInstant(wednesday, '12:00'),
      sectionId: setup.academy,
      purpose: 'Trening bramkarzy',
    })
    expect(closed.status, JSON.stringify(closed.body)).toBe(409)
    expect(closed.body?.code).toBe('place_closed')

    // AC 5 — "General purpose" on Sunday supersedes the request holding 10:00–11:30 in the same unit of work.
    const sundayRequest = String(
      runRequestProbe(club, {
        op: 'seed',
        placeId: setup.pitch,
        startsAt: zoneInstant(sunday, '10:00'),
        endsAt: zoneInstant(sunday, '11:30'),
      }).id,
    )
    const sundayBooking = await postInternalBooking(request, wojtek.token, {
      placeId: setup.pitch,
      startsAt: zoneInstant(sunday, '10:00'),
      endsAt: zoneInstant(sunday, '12:00'),
      sectionId: setup.academy,
      purpose: 'Trening bramkarzy',
    })
    expect(sundayBooking.status, JSON.stringify(sundayBooking.body)).toBe(201)
    expect(sundayBooking.body).toMatchObject({ status: 'confirmed', actingRole: 'coach' })
    expect(sundayBooking.body?.supersededRequestIds).toEqual([sundayRequest])
    expect(runRequestProbe(club, { op: 'status', id: sundayRequest }).status).toBe('superseded')

    // A booking occupies the slot for rentals and for sessions (reason `booking`).
    const rentalOnBooking = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(sunday, '10:30')),
    )
    expect(rentalOnBooking.status, JSON.stringify(rentalOnBooking.body)).toBe(409)
    expect(rentalOnBooking.body?.code).toBe('rental_conflict')
    const coordinatorBooking = await postInternalBooking(request, setup.coordinator, {
      placeId: setup.pitch,
      startsAt: zoneInstant(monday, '17:00'),
      endsAt: zoneInstant(monday, '18:00'),
      sectionId: setup.academy,
      purpose: 'Odprawa trenerów',
    })
    // The club-training zone does not stop an internal booking.
    expect(coordinatorBooking.status, JSON.stringify(coordinatorBooking.body)).toBe(201)
    const sessionOnBooking = await createEvent(request, setup.coordinator, {
      groupId: setup.orliki,
      type: 'other',
      name: 'Zbiórka Orlików',
      placeId: setup.pitch,
      startsAt: zoneInstant(monday, '17:30'),
      endsAt: zoneInstant(monday, '18:30'),
    })
    expect(sessionOnBooking.status, JSON.stringify(sessionOnBooking.body)).toBe(409)
    expect(sessionOnBooking.body?.code).toBe('occurrence_place_conflict')
    const blocks = sessionOnBooking.body?.conflicts?.flatMap((conflict) => conflict.blocks) ?? []
    expect(blocks).toContainEqual(expect.objectContaining({ id: coordinatorBooking.body?.id, reason: 'booking' }))

    // A rental, then a booking over it: 409 naming the renter.
    const rental = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(monday, '08:00')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    const overRental = await postInternalBooking(request, setup.coordinator, {
      placeId: setup.pitch,
      startsAt: zoneInstant(monday, '08:30'),
      endsAt: zoneInstant(monday, '09:00'),
      sectionId: setup.academy,
      purpose: 'Odprawa trenerów',
    })
    expect(overRental.status, JSON.stringify(overRental.body)).toBe(409)
    expect(overRental.body?.conflicts).toContainEqual(expect.objectContaining({ kind: 'rental', label: 'KS Sąsiedzi' }))

    // The zumba instructor books the hall in its public zone; another booking over it names purpose and booker.
    const training = await postInternalBooking(request, ola.token, {
      placeId: hall,
      startsAt: zoneInstant(tuesday, '18:00'),
      endsAt: zoneInstant(tuesday, '20:00'),
      sectionId: fitness,
      purpose: 'Szkolenie instruktorów',
    })
    expect(training.status, JSON.stringify(training.body)).toBe(201)
    const overBooking = await postInternalBooking(request, setup.coordinator, {
      placeId: hall,
      startsAt: zoneInstant(tuesday, '19:00'),
      endsAt: zoneInstant(tuesday, '21:00'),
      sectionId: setup.academy,
      purpose: 'Odprawa trenerów',
    })
    expect(overBooking.status, JSON.stringify(overBooking.body)).toBe(409)
    expect(overBooking.body?.conflicts).toContainEqual(
      expect.objectContaining({ kind: 'booking', label: 'Szkolenie instruktorów · Ola Instruktorka' }),
    )
    const tooShort = await postInternalBooking(request, ola.token, {
      placeId: hall,
      startsAt: zoneInstant(tuesday, '16:00'),
      endsAt: zoneInstant(tuesday, '17:00'),
      sectionId: fitness,
      purpose: 'ab',
    })
    expect(tooShort.status, JSON.stringify(tooShort.body)).toBe(400)

    // Cancellation: an unrelated coach 403; the calendar tells who may cancel; the section's coordinator and the
    // booker cancel; a second cancellation 409.
    const sundayView = await staffCalendar(
      request,
      ola.token,
      `placeId=${setup.pitch}&from=${encodeURIComponent(zoneInstant(sunday, '00:00'))}&to=${encodeURIComponent(zoneInstant(monday, '00:00'))}`,
    )
    const seenByOla = sundayView.body?.entries?.find((entry) => entry.id === sundayBooking.body?.id)
    expect(seenByOla).toMatchObject({ kind: 'booking', own: false, canCancel: false, bookedByName: 'Wojtek Trener' })
    const refused = await cancelInternalBooking(
      request,
      ola.token,
      String(sundayBooking.body?.id),
      seenByOla?.updatedAt,
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    const byCoordinator = await cancelInternalBooking(
      request,
      setup.coordinator,
      String(sundayBooking.body?.id),
      sundayBooking.body?.updatedAt,
    )
    expect(byCoordinator.status, JSON.stringify(byCoordinator.body)).toBe(200)
    expect(byCoordinator.body?.status).toBe('cancelled')
    const again = await cancelInternalBooking(
      request,
      wojtek.token,
      String(sundayBooking.body?.id),
      byCoordinator.body?.updatedAt,
    )
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    const own = await cancelInternalBooking(request, ola.token, String(training.body?.id), training.body?.updatedAt)
    expect(own.status, JSON.stringify(own.body)).toBe(200)

    // The cards of `/club/places`: every live place with its entries.
    const cards = await staffCalendar(
      request,
      wojtek.token,
      `from=${encodeURIComponent(zoneInstant(saturday, '00:00'))}&to=${encodeURIComponent(zoneInstant(sunday, '00:00'))}`,
    )
    expect(cards.status, JSON.stringify(cards.body)).toBe(200)
    expect(cards.body?.places?.map((place) => place.id)).toEqual(expect.arrayContaining([setup.pitch, hall]))
  } finally {
    await club.cleanup()
  }
})

test('TEST-058 (c) an internal booking and a rental saved at once on one slot: exactly one succeeds', async ({
  request,
}) => {
  const club = await createClub(request, 'test-058-bookings')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const thursday = nextWeekday(addDays(calendarDate(), 7), 'TH')
    for (const [round, time] of ['08:00', '09:30', '11:00', '12:30', '14:00'].entries()) {
      const startsAt = zoneInstant(thursday, time)
      const [rental, booking] = await Promise.all([
        postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, startsAt)),
        postInternalBooking(request, setup.coordinator, {
          placeId: setup.pitch,
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + 60 * 60_000).toISOString(),
          sectionId: setup.academy,
          purpose: `Odprawa ${String(round)}`,
        }),
      ])
      const won = [rental.status, booking.status].filter((status) => status === 201)
      expect(won, `round ${String(round)}: ${JSON.stringify([rental.body, booking.body])}`).toHaveLength(1)
      expect(rental.status === 201 ? booking.body?.code : rental.body?.code).toBe('rental_conflict')
    }
  } finally {
    await club.cleanup()
  }
})
