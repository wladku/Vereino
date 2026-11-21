import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { postInternalBooking, postZoneRule } from '../_fixtures/facilities'

// Club management spec TEST-085 (amendment B, research TEST-C17; REQ-013, DD-43): two internal bookings of one place
// zone posted at the same moment for overlapping ranges — the occupancy check runs under the organization's advisory
// lock, so exactly one is stored (201) and the other answers 409 `rental_conflict`. Five pairs on different slots so
// the race is real and not one lucky ordering.
test.describe.configure({ timeout: 300_000 })

const PAIRS = [
  { first: ['16:00', '17:30'], second: ['17:00', '18:00'] },
  { first: ['18:00', '19:00'], second: ['18:00', '19:00'] },
  { first: ['19:00', '20:30'], second: ['19:30', '20:00'] },
  { first: ['20:30', '21:30'], second: ['20:00', '21:00'] },
  { first: ['21:30', '22:00'], second: ['21:30', '22:00'] },
] as const

test('TEST-085 two concurrent internal bookings of overlapping ranges: exactly one 201, the other 409', async ({
  request,
}) => {
  const club = await createClub(request, 'test-085-concurrent')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const section = await createStructure(request, admin, 'sections', { name: 'Fitness' })
    const hall = await createStructure(request, admin, 'places', { name: 'Salka szkoleniowa', kind: 'hall' })
    const zone = await postZoneRule(request, admin, {
      placeId: hall,
      weekdays: [2],
      timeFrom: '16:00',
      timeTo: '22:00',
      zone: 'public_free',
      priority: 1,
      validFrom: today,
    })
    expect(zone.status, JSON.stringify(zone.body)).toBe(201)
    const tuesday = nextWeekday(addDays(today, 7), 'TU')

    for (const [index, pair] of PAIRS.entries()) {
      const booking = (range: readonly [string, string], purpose: string) =>
        postInternalBooking(request, admin, {
          placeId: hall,
          startsAt: zoneInstant(tuesday, range[0]),
          endsAt: zoneInstant(tuesday, range[1]),
          sectionId: section,
          purpose,
        })
      const results = await Promise.all([
        booking(pair.first, `Szkolenie ${String(index + 1)}A`),
        booking(pair.second, `Szkolenie ${String(index + 1)}B`),
      ])
      const statuses = results.map((result) => result.status).sort()
      expect(statuses, `pair ${String(index + 1)}: ${JSON.stringify(results.map((result) => result.body))}`).toEqual([
        201, 409,
      ])
      const refused = results.find((result) => result.status === 409)
      expect(refused?.body?.code).toBe('rental_conflict')
      const stored = results.find((result) => result.status === 201)
      expect(refused?.body?.conflicts?.length ?? 0).toBeGreaterThan(0)
      expect(stored?.body).toMatchObject({ status: 'confirmed' })
    }
  } finally {
    await club.cleanup()
  }
})
