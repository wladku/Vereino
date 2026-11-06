import { expect, test } from '@playwright/test'
import {
  addDays,
  createActivity,
  getOccurrence,
  listOccurrences,
  nextWeekday,
  scheduleFor,
  zoneInstant,
} from '../_fixtures/activities'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub } from '../_fixtures/club'
import { create as createStructure, update } from '../_fixtures/club-structure'
import {
  listClosures,
  listRates,
  listZoneRules,
  postClosure,
  postRate,
  postZoneRule,
  putClosure,
} from '../_fixtures/facilities'

// Issue #121 (E08-S01), facilities spec REQ-013 and TEST-022 (the rules part; bookings arrive with E08-S02): the club
// administrator keeps the facility rules taken from the regulations. Zone rules of equal priority may not overlap
// (409); a closure marks the planned sessions on the place and its sub-places in that time to be moved and reports
// how many; rental rates per renter category with a winter season and lighting refuse an ambiguous second rate. The
// winter rate a quote picks is covered by the unit tests of `facilities/lib/rates.ts` until the quote route lands.
test.describe.configure({ timeout: 300_000 })

test('TEST-022 zone rules: equal-priority overlap refused, other priority accepted, update and delete with the lock token', async ({
  request,
}) => {
  const club = await createClub(request, 'test-022-zones')
  try {
    const admin = club.adminToken
    const { pitch, coordinator } = await scheduleFor(request, club)
    const today = calendarDate()
    const base = { placeId: pitch, weekdays: [1, 2, 3, 4, 5], zone: 'public_free', priority: 1, validFrom: today }

    const first = await postZoneRule(request, admin, { ...base, timeFrom: '08:00', timeTo: '16:00' })
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    // Given two zone rules with equal priority overlapping, when the second is saved, then 409.
    const overlapping = await postZoneRule(request, admin, {
      ...base,
      weekdays: [3],
      timeFrom: '15:00',
      timeTo: '18:00',
    })
    expect(overlapping.status, JSON.stringify(overlapping.body)).toBe(409)
    expect(overlapping.body?.code).toBe('zone_rule_overlap')
    // A touching rule and a higher-priority one are accepted.
    const touching = await postZoneRule(request, admin, { ...base, timeFrom: '16:00', timeTo: '22:00' })
    expect(touching.status, JSON.stringify(touching.body)).toBe(201)
    const club2 = await postZoneRule(request, admin, {
      ...base,
      zone: 'club_training',
      priority: 2,
      timeFrom: '17:00',
      timeTo: '19:00',
    })
    expect(club2.status, JSON.stringify(club2.body)).toBe(201)
    // Inverted times answer 422; a coordinator (facilities.view only) cannot write.
    const inverted = await postZoneRule(request, admin, { ...base, weekdays: [6], timeFrom: '12:00', timeTo: '10:00' })
    expect(inverted.status, JSON.stringify(inverted.body)).toBe(422)
    expect(inverted.body?.code).toBe('zone_rule_times_invalid')
    const forbidden = await postZoneRule(request, coordinator, {
      ...base,
      weekdays: [6],
      timeFrom: '08:00',
      timeTo: '10:00',
    })
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403)

    // Moving the touching rule onto the first one is refused too; with the lock token a free move is saved.
    const rules = await listZoneRules(request, admin, `&placeId=${pitch}`)
    expect(rules).toHaveLength(3)
    const touchingRule = rules.find((rule) => rule.id === touching.body?.id)
    const refusedMove = await call(request, 'PUT', '/api/facilities/zone-rules', admin, {
      data: { id: touchingRule?.id, timeFrom: '15:00' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(touchingRule?.updatedAt) },
    })
    expect(refusedMove.status, JSON.stringify(refusedMove.body)).toBe(409)
    expect(refusedMove.body?.code).toBe('zone_rule_overlap')
    const moved = await call(request, 'PUT', '/api/facilities/zone-rules', admin, {
      data: { id: touchingRule?.id, timeTo: '21:00' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(touchingRule?.updatedAt) },
    })
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    const removed = await call(request, 'DELETE', `/api/facilities/zone-rules?id=${String(touchingRule?.id)}`, admin, {
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(moved.body?.updatedAt) },
    })
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    expect(await listZoneRules(request, admin, `&placeId=${pitch}`)).toHaveLength(2)
  } finally {
    await club.cleanup()
  }
})

test('TEST-022 closures: a closure on the complex marks the sessions on its pitch to be moved and counts them', async ({
  request,
}) => {
  const club = await createClub(request, 'test-022-closures')
  try {
    const admin = club.adminToken
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const complex = await createStructure(request, admin, 'places', { name: 'Orlik 2024', kind: 'complex' })
    const placeResult = await call<{ items?: Array<{ id: string; updatedAt: string }> }>(
      request,
      'GET',
      `/api/club_core/places?ids=${pitch}`,
      admin,
    )
    const moved = await update(
      request,
      admin,
      'places',
      { id: pitch, parentPlaceId: complex },
      placeResult.body?.items?.[0]?.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)

    // A session on Tuesday 17:00–18:30 on the pitch and one on Wednesday that the closure does not touch.
    const tuesday = nextWeekday(addDays(calendarDate(), 1), 'TU')
    const oneOff = (day: string) => ({
      groupId: zaki,
      name: `Trening ${day}`,
      type: 'training',
      placeId: pitch,
      startsOn: day,
      startTime: '17:00',
      endTime: '18:30',
    })
    const tuesdayActivity = await createActivity(request, coordinator, oneOff(tuesday))
    await createActivity(request, coordinator, oneOff(addDays(tuesday, 1)))
    const sessions = await listOccurrences(request, coordinator, `&activityId=${tuesdayActivity.id}`)
    expect(sessions.items).toHaveLength(1)
    const tuesdaySession = sessions.items[0]
    expect(tuesdaySession.needsReschedule).toBe(false)

    // Refused periods first: the end must be after the start.
    const refused = await postClosure(request, admin, {
      placeId: complex,
      startsAt: zoneInstant(tuesday, '20:00'),
      endsAt: zoneInstant(tuesday, '16:00'),
      reason: 'snow',
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(422)
    expect(refused.body?.code).toBe('closure_period_invalid')

    // Given a closure over Tuesday 17:00 with a session, when saved, then the session is marked and counted.
    const closure = await postClosure(request, admin, {
      placeId: complex,
      startsAt: zoneInstant(tuesday, '16:00'),
      endsAt: zoneInstant(tuesday, '20:00'),
      reason: 'municipal_event',
      note: 'Gminny festyn',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    expect(closure.body?.flagged).toEqual({ sessions: 1, rentals: 0 })
    const flagged = await getOccurrence(request, coordinator, tuesdaySession.id)
    expect(flagged.body?.needsReschedule).toBe(true)
    const wednesday = await listOccurrences(request, coordinator, '&needsReschedule=false')
    expect(wednesday.items.map((item) => item.occurrenceDate)).toEqual([addDays(tuesday, 1)])

    // A second save over the same session counts nothing new; moving the closure to Wednesday marks that session.
    const [stored] = await listClosures(request, admin, `&placeId=${complex}`)
    expect(stored).toMatchObject({ reason: 'municipal_event', note: 'Gminny festyn' })
    const wednesdayClosure = await putClosure(
      request,
      admin,
      {
        id: stored.id,
        startsAt: zoneInstant(addDays(tuesday, 1), '16:00'),
        endsAt: zoneInstant(addDays(tuesday, 1), '20:00'),
      },
      stored.updatedAt,
    )
    expect(wednesdayClosure.status, JSON.stringify(wednesdayClosure.body)).toBe(200)
    expect(wednesdayClosure.body?.flagged).toEqual({ sessions: 1, rentals: 0 })
    const again = await postClosure(request, admin, {
      placeId: pitch,
      startsAt: zoneInstant(tuesday, '17:30'),
      endsAt: zoneInstant(tuesday, '18:00'),
      reason: 'snow',
    })
    expect(again.status, JSON.stringify(again.body)).toBe(201)
    expect(again.body?.flagged).toEqual({ sessions: 0, rentals: 0 })

    // A coordinator holds `facilities.view` only: a closure is refused.
    const forbidden = await postClosure(request, coordinator, {
      placeId: pitch,
      startsAt: zoneInstant(tuesday, '08:00'),
      endsAt: zoneInstant(tuesday, '09:00'),
      reason: 'snow',
    })
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403)
  } finally {
    await club.cleanup()
  }
})

test('TEST-022 rental rates: three categories with a winter season, an ambiguous rate and a broken season refused', async ({
  request,
}) => {
  const club = await createClub(request, 'test-022-rates')
  try {
    const admin = club.adminToken
    const { pitch } = await scheduleFor(request, club)
    const validFrom = calendarDate()
    const rates = [
      { renterCategory: 'municipal_club', pricePer90: 15000 },
      {
        renterCategory: 'municipal_club_winter_lighting',
        pricePer90: 22000,
        seasonFrom: '11-01',
        seasonTo: '03-31',
        includesLighting: true,
      },
      { renterCategory: 'external_commercial', pricePer90: 35000 },
    ]
    for (const rate of rates) {
      const created = await postRate(request, admin, { placeId: pitch, validFrom, ...rate })
      expect(created.status, JSON.stringify(created.body)).toBe(201)
    }
    expect(await listRates(request, admin, `&placeId=${pitch}`)).toHaveLength(3)
    const winter = await listRates(request, admin, '&renterCategory=municipal_club_winter_lighting')
    expect(winter).toEqual([
      expect.objectContaining({ pricePer90: 22000, seasonFrom: '11-01', seasonTo: '03-31', includesLighting: true }),
    ])

    const ambiguous = await postRate(request, admin, {
      placeId: pitch,
      validFrom,
      renterCategory: 'municipal_club',
      pricePer90: 16000,
    })
    expect(ambiguous.status, JSON.stringify(ambiguous.body)).toBe(409)
    expect(ambiguous.body?.code).toBe('rental_rate_overlap')
    const halfSeason = await postRate(request, admin, {
      placeId: pitch,
      validFrom,
      renterCategory: 'external_commercial',
      pricePer90: 40000,
      seasonFrom: '11-01',
    })
    expect(halfSeason.status, JSON.stringify(halfSeason.body)).toBe(422)
    expect(halfSeason.body?.code).toBe('rental_rate_season_invalid')
    const negative = await postRate(request, admin, {
      placeId: pitch,
      validFrom,
      renterCategory: 'external_commercial',
      pricePer90: -1,
    })
    expect(negative.status, JSON.stringify(negative.body)).toBe(400)
  } finally {
    await club.cleanup()
  }
})
