import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import {
  listRentals,
  phoneRental,
  postClosure,
  postEntryBan,
  postRental,
  quoteRental,
  rentalPitch,
} from '../_fixtures/facilities'

// Issue #122 (E08-S02), facilities spec REQ-013, TEST-022 (the rental part) and TEST-058 (a): staff enter a rental
// after a phone call. The quote shows the amount from the rate (the winter-lighting rate for a municipal club in its
// season), the payment due date and the free-cancellation deadline; a saved 2-unit rental is listed with them. A slot
// in a club-training zone answers 409 `zone_not_reservable`, a renter with an active ban 409 `entry_ban_active`, a
// taken slot 409 `rental_conflict`, a closure 409 `place_closed`; two staff saving the same slot at once — one wins.
test.describe.configure({ timeout: 300_000 })

const HOUR = 3_600_000

test('TEST-022 rentals: quote, save, list, and the refusals with their codes', async ({ request }) => {
  const club = await createClub(request, 'test-022-rentals')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const wednesday = nextWeekday(addDays(calendarDate(), 7), 'WE')
    const startsAt = zoneInstant(wednesday, '08:00')

    // The live quote: 2 units × 250 zł for an external renter; a municipal club gets the lighting rate.
    const quote = await quoteRental(request, admin, {
      placeId: setup.pitch,
      renterCategory: 'external_commercial',
      startsAt,
      units: 2,
    })
    expect(quote.status, JSON.stringify(quote.body)).toBe(200)
    expect(quote.body).toMatchObject({ amount: 50_000, appliedCategory: 'external_commercial', issues: [] })
    expect(quote.body?.endsAt).toBe(new Date(Date.parse(startsAt) + 3 * HOUR).toISOString())
    expect(quote.body?.cancellationDeadline).toBe(new Date(Date.parse(startsAt) - 24 * HOUR).toISOString())
    expect(quote.body?.paymentDeadline).toBe(new Date(Date.parse(startsAt) - 72 * HOUR).toISOString())
    const municipal = await quoteRental(request, admin, {
      placeId: setup.pitch,
      renterCategory: 'municipal_club',
      startsAt,
      units: 1,
    })
    expect(municipal.body).toMatchObject({ amount: 18_000, appliedCategory: 'municipal_club_winter_lighting' })

    // Given a free bookable slot, when the administrator saves a 2-unit rental, then it is listed with the amount and
    // the dates; without `payments`' charge service there is no charge (DD-19).
    const created = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, startsAt, 2))
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body).toMatchObject({ status: 'requested', amount: 50_000, chargeId: null })
    const active = await listRentals(request, admin, '&tab=active')
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({
      id: created.body?.id,
      placeId: setup.pitch,
      renterDisplayName: 'KS Sąsiedzi',
      contactPhone: '600 000 001',
      requestedVia: 'phone',
      units: 2,
      amount: 50_000,
      status: 'requested',
      cancellationDeadline: quote.body?.cancellationDeadline,
      paymentDeadline: quote.body?.paymentDeadline,
    })
    expect(active[0]?.regulationsAcceptedAt).not.toBeNull()
    expect(await listRentals(request, admin, '&tab=awaiting_approval')).toHaveLength(0)

    // The taken slot: 409 `rental_conflict` with the conflicting rental; the quote lists the same issue.
    const overlapping = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(wednesday, '09:30')),
    )
    expect(overlapping.status, JSON.stringify(overlapping.body)).toBe(409)
    expect(overlapping.body?.code).toBe('rental_conflict')
    expect(overlapping.body?.conflicts?.map((conflict) => conflict.id)).toEqual([created.body?.id])

    // Given a slot in a club-training zone, when saved, then 409 `zone_not_reservable`.
    const training = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(wednesday, '17:00')),
    )
    expect(training.status, JSON.stringify(training.body)).toBe(409)
    expect(training.body?.code).toBe('zone_not_reservable')

    // Given a renter with an active ban, when saved, then 409 `entry_ban_active`.
    const ban = await postEntryBan(request, admin, {
      placeId: setup.pitch,
      subjectType: 'institution',
      subjectId: setup.banned,
      startsOn: calendarDate(),
      reason: 'Zniszczenie bramki',
    })
    expect(ban.status, JSON.stringify(ban.body)).toBe(201)
    const thursday = addDays(wednesday, 1)
    const banned = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.banned, zoneInstant(thursday, '19:30')),
    )
    expect(banned.status, JSON.stringify(banned.body)).toBe(409)
    expect(banned.body?.code).toBe('entry_ban_active')

    // A closure answers 409 `place_closed`; so does a slot outside the opening hours (Sat after 20:30).
    const friday = addDays(wednesday, 2)
    const closure = await postClosure(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(friday, '00:00'),
      endsAt: zoneInstant(addDays(friday, 1), '00:00'),
      reason: 'snow',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    const closed = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(friday, '19:30')),
    )
    expect(closed.status, JSON.stringify(closed.body)).toBe(409)
    expect(closed.body?.code).toBe('place_closed')
    const saturday = addDays(wednesday, 3)
    const late = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(saturday, '20:00')),
    )
    expect(late.status, JSON.stringify(late.body)).toBe(409)
    expect(late.body?.code).toBe('place_closed')

    // Units outside 1–4 and an unregistered renter without a name answer 422; a coordinator cannot enter rentals.
    const tooMany = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(thursday, '12:00'), 5),
    )
    expect(tooMany.status, JSON.stringify(tooMany.body)).toBe(422)
    expect(tooMany.body?.code).toBe('rental_units_invalid')
    const nameless = await postRental(request, admin, {
      ...phoneRental(setup.pitch, setup.neighbours, zoneInstant(thursday, '12:00')),
      renterType: 'unregistered',
      renterId: null,
    })
    expect(nameless.status, JSON.stringify(nameless.body)).toBe(422)
    expect(nameless.body?.code).toBe('rental_renter_invalid')
    const forbidden = await postRental(
      request,
      setup.coordinator,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(thursday, '12:00')),
    )
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403)
    expect(await listRentals(request, admin)).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})

test('TEST-058 (a) two staff saving the same slot at once: one rental wins, the other gets 409 rental_conflict', async ({
  request,
}) => {
  const club = await createClub(request, 'test-058-rentals')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const monday = nextWeekday(addDays(calendarDate(), 7), 'MO')
    for (const [round, time] of ['08:00', '09:30', '11:00', '12:30', '14:00'].entries()) {
      const body = phoneRental(setup.pitch, setup.neighbours, zoneInstant(monday, time))
      const results = await Promise.all([postRental(request, admin, body), postRental(request, admin, body)])
      const statuses = results.map((result) => result.status).sort()
      expect(statuses, `round ${String(round)}: ${JSON.stringify(results.map((result) => result.body))}`).toEqual([
        201, 409,
      ])
      expect(results.find((result) => result.status === 409)?.body?.code).toBe('rental_conflict')
    }
    expect(await listRentals(request, admin, '&tab=active')).toHaveLength(5)
  } finally {
    await club.cleanup()
  }
})
