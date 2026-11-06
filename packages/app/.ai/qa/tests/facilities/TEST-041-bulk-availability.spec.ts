import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { addDays, createActivity, nextWeekday, scheduleFor } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure, getOne, update } from '../_fixtures/club-structure'
import {
  ORLIK_HOURS,
  bulkAvailability,
  listZoneRules,
  postZoneRule,
  setOpeningHours,
  type ZoneRuleItem,
} from '../_fixtures/facilities'

// Issue #121 (E08-S01), facilities spec REQ-029 and TEST-041: the club administrator opens weekly booking availability
// for several places in one go. The windows are checked per day against the order of the times, the 90-minute unit
// and the place's opening hours (DD-41, `club_core_places.opening_hours`); "replace" removes the existing availability
// on the selected days, "append" refuses an equal-priority overlap; club sessions inside the new windows are reported
// as a warning; one transaction for all places. The public calendar's view of these rules (TEST-041's "bookable"
// stretches) arrives with E08-S04.
test.describe.configure({ timeout: 300_000 })

const MON_FRI = [1, 2, 3, 4, 5]

function availabilityOn(rules: ZoneRuleItem[], placeId: string, weekday: number, today: string): ZoneRuleItem[] {
  return rules.filter(
    (rule) =>
      rule.placeId === placeId &&
      rule.source === 'availability' &&
      rule.weekdays.includes(weekday) &&
      (rule.validTo === null || rule.validTo >= today),
  )
}

test('TEST-041 bulk availability: replace for two pitches, per-day hours, refused days, append overlap, removing a day', async ({
  request,
}) => {
  const club = await createClub(request, 'test-041-availability')
  try {
    const admin = club.adminToken
    const { pitch: pitchA, zaki, coordinator } = await scheduleFor(request, club)
    const pitchB = await createStructure(request, admin, 'places', { name: 'Boisko B', kind: 'pitch' })
    const today = calendarDate()

    // Opening hours (DD-41): overlapping windows of one day are refused at the field; the Orlik hours are accepted.
    const placeA = await getOne(request, admin, 'places', pitchA)
    const badHours = await update(
      request,
      admin,
      'places',
      {
        id: pitchA,
        openingHours: {
          seasons: [
            {
              from: '01-01',
              to: '12-31',
              windows: [
                { weekday: 1, from: '08:00', to: '12:00' },
                { weekday: 1, from: '11:00', to: '14:00' },
              ],
            },
          ],
        },
      },
      placeA?.updatedAt,
    )
    expect(badHours.status, JSON.stringify(badHours.body)).toBe(422)
    expect(badHours.body?.code).toBe('place_opening_hours_invalid')
    await setOpeningHours(request, admin, pitchA, ORLIK_HOURS)
    await setOpeningHours(request, admin, pitchB, ORLIK_HOURS)
    expect((await getOne(request, admin, 'places', pitchA))?.openingHours).toEqual(ORLIK_HOURS)

    // Regulation zones on both pitches; club classes on pitch A next Monday 18:00–19:30.
    for (const placeId of [pitchA, pitchB]) {
      const rule = await postZoneRule(request, admin, {
        placeId,
        weekdays: MON_FRI,
        timeFrom: '08:00',
        timeTo: '22:00',
        zone: 'public_free',
        priority: 1,
        validFrom: today,
      })
      expect(rule.status, JSON.stringify(rule.body)).toBe(201)
    }
    const monday = nextWeekday(addDays(today, 1), 'MO')
    await createActivity(request, coordinator, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitchA,
      startsOn: monday,
      startTime: '18:00',
      endTime: '19:30',
    })

    // The coordinator holds `facilities.view` only: setting availability is refused.
    const forbidden = await bulkAvailability(request, coordinator, {
      placeIds: [pitchA],
      validFrom: today,
      windows: [{ weekday: 1, from: '16:00', to: '22:00' }],
    })
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403)

    // Mon–Fri 16:00–22:00 for both pitches, "replace": one rule per pitch, the Monday session is reported.
    const weekdays = await bulkAvailability(request, admin, {
      placeIds: [pitchA, pitchB],
      mode: 'replace',
      validFrom: today,
      windows: MON_FRI.map((weekday) => ({ weekday, from: '16:00', to: '22:00' })),
    })
    expect(weekdays.status, JSON.stringify(weekdays.body)).toBe(200)
    expect(weekdays.body).toEqual({
      created: 2,
      removed: 0,
      warnings: { clubOccurrencesInWindows: 1, pendingRequestsOutside: 0 },
    })
    let rules = await listZoneRules(request, admin, '&source=availability')
    for (const placeId of [pitchA, pitchB]) {
      const [rule] = rules.filter((item) => item.placeId === placeId)
      expect(rule).toMatchObject({
        weekdays: MON_FRI,
        timeFrom: '16:00',
        timeTo: '22:00',
        zone: 'reservable_paid',
        priority: 3,
        source: 'availability',
        validFrom: today,
        validTo: null,
      })
    }

    // Saturday 9:00–20:30 in per-day mode: added next to the weekday rules.
    const saturday = await bulkAvailability(request, admin, {
      placeIds: [pitchA, pitchB],
      validFrom: today,
      windows: [{ weekday: 6, from: '09:00', to: '20:30' }],
    })
    expect(saturday.status, JSON.stringify(saturday.body)).toBe(200)
    expect(saturday.body).toMatchObject({ created: 2, removed: 0 })

    // Refused days: 60 minutes, outside the opening hours, "to" before "from" — 422 at the day, nothing written.
    const countBefore = (await listZoneRules(request, admin)).length
    const refusals: Array<[{ weekday: number; from: string; to: string }, string]> = [
      [{ weekday: 1, from: '15:00', to: '16:00' }, 'availability_too_short'],
      [{ weekday: 2, from: '07:00', to: '10:00' }, 'availability_outside_opening_hours'],
      [{ weekday: 3, from: '18:00', to: '16:00' }, 'availability_time_order'],
    ]
    for (const [window, code] of refusals) {
      const refused = await bulkAvailability(request, admin, {
        placeIds: [pitchA],
        validFrom: today,
        windows: [window],
      })
      expect(refused.status, JSON.stringify(refused.body)).toBe(422)
      expect(refused.body?.code).toBe(code)
      expect(refused.body?.dayErrors).toEqual([{ placeId: pitchA, weekday: window.weekday, code }])
      expect(Object.keys(refused.body?.fieldErrors ?? {})).toEqual([`day-${String(window.weekday)}`])
    }
    const inverted = await bulkAvailability(request, admin, {
      placeIds: [pitchA],
      validFrom: today,
      validTo: addDays(today, -1),
      windows: [{ weekday: 1, from: '16:00', to: '22:00' }],
    })
    expect(inverted.status, JSON.stringify(inverted.body)).toBe(422)
    expect(inverted.body?.code).toBe('validity_inverted')
    // One transaction for all places: an unknown place refuses the whole batch.
    const unknownPlace = await bulkAvailability(request, admin, {
      placeIds: [pitchA, randomUUID()],
      validFrom: today,
      windows: [{ weekday: 7, from: '10:00', to: '12:00' }],
    })
    expect(unknownPlace.status, JSON.stringify(unknownPlace.body)).toBe(422)
    expect(unknownPlace.body?.code).toBe('facilities_reference_invalid')
    expect((await listZoneRules(request, admin)).length).toBe(countBefore)

    // "Append" with a window overlapping the Monday availability (equal priority) → 409, nothing written.
    const append = await bulkAvailability(request, admin, {
      placeIds: [pitchA],
      mode: 'append',
      validFrom: today,
      windows: [{ weekday: 1, from: '17:00', to: '21:00' }],
    })
    expect(append.status, JSON.stringify(append.body)).toBe(409)
    expect(append.body?.code).toBe('zone_rule_overlap')
    expect((await listZoneRules(request, admin)).length).toBe(countBefore)

    // Removing Friday on pitch A: "replace" with Friday selected and no window.
    const removeFriday = await bulkAvailability(request, admin, {
      placeIds: [pitchA],
      mode: 'replace',
      validFrom: today,
      weekdays: [5],
      windows: [],
    })
    expect(removeFriday.status, JSON.stringify(removeFriday.body)).toBe(200)
    expect(removeFriday.body).toMatchObject({ created: 0, removed: 1 })
    rules = await listZoneRules(request, admin, '&source=availability')
    expect(availabilityOn(rules, pitchA, 5, today)).toEqual([])
    expect(availabilityOn(rules, pitchA, 1, today)).toEqual([
      expect.objectContaining({ weekdays: [1, 2, 3, 4], timeFrom: '16:00', timeTo: '22:00' }),
    ])
    expect(availabilityOn(rules, pitchA, 6, today)).toHaveLength(1)
    expect(availabilityOn(rules, pitchB, 5, today)).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
