import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, weekdayOf, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import {
  getRental,
  phoneRental,
  postRental,
  rentalAction,
  rentalPitch,
  runRentalLifecycle,
} from '../_fixtures/facilities'

// Issue #122 (E08-S02), facilities spec REQ-013, TEST-023 (without `payments`): a rental's status is managed until its
// slot ends — confirmed by staff (no charge service, DD-19), cancelled free more than 24 h before and late (charge
// forfeited) within 24 h, moved to a free slot (status and amount kept; an occupied slot refused), a no-show recorded;
// a cancelled rental cannot be confirmed (409 `invalid_transition`); the lifecycle job run through the CLI with `--now`
// closes a confirmed rental after its end (DD-46).
test.describe.configure({ timeout: 300_000 })

const HALF_HOUR = 1_800_000

/** The first bookable start within the next 24 h (weekdays 08:00–14:30, weekends 09:00–19:00), at least 30 min away. */
function startWithinADay(): string {
  const now = Date.now()
  for (const date of [calendarDate(), calendarDate(1)]) {
    const weekend = ['SA', 'SU'].includes(weekdayOf(date))
    for (let minutes = weekend ? 9 * 60 : 8 * 60; minutes <= (weekend ? 19 * 60 : 14 * 60 + 30); minutes += 30) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
      const instant = zoneInstant(date, time)
      const at = Date.parse(instant)
      if (at >= now + HALF_HOUR && at <= now + 23 * 2 * HALF_HOUR) return instant
    }
  }
  throw new Error('[internal] no bookable start within a day')
}

test('TEST-023 rental status: confirm, cancel free and late, move, no-show, lifecycle done', async ({ request }) => {
  const club = await createClub(request, 'test-023-rentals')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const tuesday = nextWeekday(addDays(calendarDate(), 7), 'TU')
    const enter = async (startsAt: string) => {
      const created = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, startsAt))
      expect(created.status, JSON.stringify(created.body)).toBe(201)
      return String(created.body?.id)
    }

    // Confirm by hand (no `payments` charge service): requested → confirmed.
    const first = await enter(zoneInstant(tuesday, '08:00'))
    const confirmed = await rentalAction(request, admin, first, 'confirm')
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    expect(confirmed.body?.status).toBe('confirmed')

    // Move to a free slot: the status and the amount stay; onto an occupied slot: 409 `rental_conflict`.
    const second = await enter(zoneInstant(tuesday, '11:00'))
    const moved = await rentalAction(request, admin, first, 'move', { startsAt: zoneInstant(tuesday, '09:30') })
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body).toMatchObject({
      status: 'confirmed',
      startsAt: new Date(zoneInstant(tuesday, '09:30')).toISOString(),
    })
    expect(await getRental(request, admin, first)).toMatchObject({ status: 'confirmed', amount: 25_000 })
    const onto = await rentalAction(request, admin, first, 'move', { startsAt: zoneInstant(tuesday, '10:30') })
    expect(onto.status, JSON.stringify(onto.body)).toBe(409)
    expect(onto.body?.code).toBe('rental_conflict')

    // Cancel more than 24 h before: `cancelled_free`; the slot is free again, and a cancelled rental cannot be confirmed.
    const free = await rentalAction(request, admin, second, 'cancel', { reason: 'Drużyna zrezygnowała' })
    expect(free.status, JSON.stringify(free.body)).toBe(200)
    expect(free.body?.status).toBe('cancelled_free')
    const again = await enter(zoneInstant(tuesday, '11:00'))
    const reconfirm = await rentalAction(request, admin, second, 'confirm')
    expect(reconfirm.status, JSON.stringify(reconfirm.body)).toBe(409)
    expect(reconfirm.body?.code).toBe('invalid_transition')

    // Given a cancellation under 24 h before, then `cancelled_late` (the charge is forfeited).
    const soon = await enter(startWithinADay())
    const late = await rentalAction(request, admin, soon, 'cancel')
    expect(late.status, JSON.stringify(late.body)).toBe(200)
    expect(late.body?.status).toBe('cancelled_late')

    // A no-show only after the start: before it, 409 `rental_not_started` (the allowed case is unit-tested,
    // `noShowAllowed`, because the real clock cannot reach a future start here).
    const noShow = await rentalAction(request, admin, again, 'no-show')
    expect(noShow.status, JSON.stringify(noShow.body)).toBe(409)
    expect(noShow.body?.code).toBe('rental_not_started')

    // The lifecycle: before the end nothing moves; after it the confirmed rental is `done`, and a rerun changes nothing.
    const before = runRentalLifecycle(club, zoneInstant(tuesday, '10:00'))
    expect(before.done).toBe(0)
    const after = runRentalLifecycle(club, zoneInstant(tuesday, '11:01'))
    expect(after).toMatchObject({ done: 1, changedIds: [first] })
    expect(runRentalLifecycle(club, zoneInstant(tuesday, '12:00')).done).toBe(0)
    expect((await getRental(request, admin, first)).status).toBe('done')
  } finally {
    await club.cleanup()
  }
})
