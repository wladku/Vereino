import { expect, test } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createEvent,
  getActivity,
  getOccurrence,
  listOccurrences,
  moveOccurrence,
  nextWeekday,
  postActivity,
  zoneInstant,
} from '../_fixtures/activities'
import { readCalendarItem } from '../_fixtures/attendance'
import { calendarDate, call, createClub, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { publicGet, publish } from '../_fixtures/publication'

// Groups and activities parity spec TEST-A11 (REQ-A08, DD-A03, DD-A04, DD-A05, Q-A25; D-031 §6; #270): a coach of
// team A and class group C creates a sparring for A at a typed venue with an opponent, a gathering time and a deadline
// (201: `venue`, `placeId` null, `isAway` true), a match for A at a club place, and a typed-venue sparring with
// `isAway: false`; a sparring for C answers 422 `activity_type_requires_team`, an event for team B of another coach
// 403, a place and a venue together or neither 422 `venue_or_place_required`; a series with a venue (the coordinator)
// 422 `venue_requires_one_off`. The coach edits and cancels the own event, but editing a session of a series answers
// 403 `coach_edit_series_session`. A typed-venue session is in no place's schedule: the facility calendar of the pitch
// omits it, while the calendar, the sessions list and the public session page read it without failing.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const VENUE = { name: 'Stadion Wisły Liszki', address: 'ul. Sportowa 1, Liszki' }

test('TEST-A11 a coach creates a typed-venue sparring and a club-place match for a team, is refused for a class group, another coach’s team, both or neither location and a series venue, and edits and cancels only the own one-off event', async ({
  request,
}) => {
  const club = await createClub(request, 'test-a11')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const fitness = await createStructure(request, admin, 'sections', { name: 'Ogólnorozwojowe' })
    const teamA = await createGroup(request, admin, { sectionId: academy, name: 'Orliki młodsze', kind: 'team' })
    const teamB = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const classC = await createGroup(request, admin, { sectionId: fitness, name: 'Gimnastyka C', kind: 'class_group' })
    const pitch = await createStructure(request, admin, 'places', { name: 'Boisko główne', kind: 'pitch' })
    const opponent = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
      data: { name: 'Wisła Liszki', clubName: 'Wisła Liszki' },
    })
    expect(opponent.status, JSON.stringify(opponent.body)).toBe(201)
    const opponentId = String(opponent.body?.id)

    const today = calendarDate()
    const coach = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    const otherCoach = await signedInStaff(request, club, { firstName: 'Ola', lastName: 'Trenerka', role: 'coach' })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Koordynatorka',
      role: 'coordinator',
      sectionId: academy,
    })
    for (const [groupId, personId] of [
      [teamA, coach.personId],
      [classC, coach.personId],
      [teamB, otherCoach.personId],
    ] as const) {
      await addMembership(request, admin, { groupId, personId, role: 'coach', validFrom: addDays(today, -30) })
    }
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const sunday = addDays(saturday, 1)

    // --- J-A02 step 1: a sparring for A at a typed venue, with an opponent, a gathering time and a deadline ---
    const sparring = await createEvent(request, coach.token, {
      groupId: teamA,
      type: 'sparring',
      name: 'Sparing z Wisłą Liszki',
      venue: VENUE,
      opponentExternalTeamId: opponentId,
      startsAt: zoneInstant(saturday, '09:00'),
      endsAt: zoneInstant(saturday, '10:30'),
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 2 * 24 * 60,
    })
    expect(sparring.status, JSON.stringify(sparring.body)).toBe(201)
    expect(sparring.body).toMatchObject({ venue: VENUE, placeId: null, isAway: true, actingRole: 'coach' })
    const sparringId = String(sparring.body?.occurrenceId)
    const sparringActivity = await getActivity(request, admin, String(sparring.body?.id))
    expect(sparringActivity.body).toMatchObject({
      type: 'sparring',
      placeId: null,
      placeName: VENUE.name,
      venue: VENUE,
      opponentExternalTeamId: opponentId,
      isAway: true,
      gatheringMinutesBefore: 30,
      recurrenceRule: null,
    })
    const stored = await getOccurrence(request, admin, sparringId)
    expect(stored.body).toMatchObject({
      placeId: null,
      placeName: VENUE.name,
      placeAddress: VENUE.address,
      venue: VENUE,
      gatheringAt: zoneInstant(saturday, '08:30'),
      opponentName: 'Wisła Liszki',
    })

    // The coach reads it as a session they may edit; the calendar and the sessions list read a session without a place.
    const coachItem = await readCalendarItem(request, coach.token, sparringId, 'as=coach')
    expect(coachItem.status, JSON.stringify(coachItem.body)).toBe(200)
    const coachEntry = coachItem.body as unknown as {
      occurrence: { placeId: string | null; venue: unknown; placeName: string | null; placeAddress: string | null }
      mayEdit?: boolean
    }
    expect(coachEntry.occurrence).toMatchObject({
      placeId: null,
      venue: VENUE,
      placeName: VENUE.name,
      placeAddress: VENUE.address,
    })
    expect(coachEntry.mayEdit).toBe(true)
    const calendar = await call<{ items?: Array<{ occurrence: { id: string } }> }>(
      request,
      'GET',
      `/api/activities/calendar?as=coach&from=${saturday}&to=${sunday}`,
      coach.token,
    )
    expect(calendar.status, JSON.stringify(calendar.body)).toBe(200)
    expect(calendar.body?.items?.map((item) => item.occurrence.id)).toContain(sparringId)
    const listed = await listOccurrences(request, admin, `&groupId=${teamA}`)
    expect(listed.status).toBe(200)
    expect(listed.items.find((item) => item.id === sparringId)).toMatchObject({ placeId: null, placeName: VENUE.name })

    // A typed venue occupies no club place: the facility calendar of the pitch omits it.
    const range = `from=${encodeURIComponent(zoneInstant(saturday, '00:00'))}&to=${encodeURIComponent(zoneInstant(sunday, '00:00'))}`
    const facility = await call(request, 'GET', `/api/facilities/calendar?${range}&placeId=${pitch}`, admin)
    expect(facility.status, JSON.stringify(facility.body)).toBe(200)
    expect(JSON.stringify(facility.body)).not.toContain(sparringId)
    // The public session page reads it too.
    const slug = `ta11-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])
    const publicPage = await publicGet(request, `/api/activities/public/${slug}/sessions/${sparringId}`)
    expect(publicPage.status, JSON.stringify(publicPage.body)).toBe(200)

    // --- A match for A at a club place; a typed-venue sparring with "away" unticked ---
    const match = await createEvent(request, coach.token, {
      groupId: teamA,
      type: 'match',
      name: 'Mecz ligowy',
      placeId: pitch,
      opponentExternalTeamId: opponentId,
      startsAt: zoneInstant(sunday, '11:00'),
      endsAt: zoneInstant(sunday, '12:30'),
    })
    expect(match.status, JSON.stringify(match.body)).toBe(201)
    expect(match.body).toMatchObject({ placeId: pitch, venue: null, isAway: false })
    const homeVenue = await createEvent(request, coach.token, {
      groupId: teamA,
      type: 'sparring',
      name: 'Sparing na Orliku',
      venue: { name: 'Orlik Szkolny', address: 'ul. Szkolna 5, Kraków' },
      isAway: false,
      startsAt: zoneInstant(sunday, '15:00'),
      endsAt: zoneInstant(sunday, '16:00'),
    })
    expect(homeVenue.status, JSON.stringify(homeVenue.body)).toBe(201)
    expect(homeVenue.body).toMatchObject({ placeId: null, isAway: false })

    // --- Refusals ---
    const base = {
      type: 'sparring',
      name: 'Sparing',
      venue: VENUE,
      startsAt: zoneInstant(sunday, '17:00'),
      endsAt: zoneInstant(sunday, '18:00'),
    }
    const forClass = await createEvent(request, coach.token, { ...base, groupId: classC })
    expect(forClass.status, JSON.stringify(forClass.body)).toBe(422)
    expect(forClass.body?.code).toBe('activity_type_requires_team')
    const forOther = await createEvent(request, coach.token, { ...base, groupId: teamB })
    expect(forOther.status, JSON.stringify(forOther.body)).toBe(403)
    const both = await createEvent(request, coach.token, { ...base, groupId: teamA, placeId: pitch })
    expect(both.status, JSON.stringify(both.body)).toBe(422)
    expect(both.body?.code).toBe('venue_or_place_required')
    const neither = await createEvent(request, coach.token, { ...base, groupId: teamA, venue: undefined })
    expect(neither.status, JSON.stringify(neither.body)).toBe(422)
    expect(neither.body?.code).toBe('venue_or_place_required')
    const training = await createEvent(request, coach.token, { ...base, groupId: teamA, type: 'training' })
    expect(training.status, JSON.stringify(training.body)).toBe(422)
    expect(training.body?.code).toBe('event_type_not_allowed')
    const seriesWithVenue = await postActivity(request, coordinator.token, {
      groupId: teamA,
      name: 'Treningi wyjazdowe',
      type: 'training',
      venue: VENUE,
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      startsOn: addDays(today, 1),
      startTime: '17:00',
      endTime: '18:00',
    })
    expect(seriesWithVenue.status, JSON.stringify(seriesWithVenue.body)).toBe(422)
    expect(seriesWithVenue.body?.code).toBe('venue_requires_one_off')

    // --- J-A02 step 6: the coach edits the own event (a later start, another venue), then cancels another one ---
    const moved = await moveOccurrence(
      request,
      coach.token,
      sparringId,
      {
        startAt: zoneInstant(saturday, '10:00'),
        endAt: zoneInstant(saturday, '11:30'),
        venue: { name: 'Stadion Wisły Liszki', address: 'ul. Sportowa 3, Liszki' },
      },
      (stored.body as { updatedAt?: string } | null)?.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body?.actingRole).toBe('coach')
    const after = await getOccurrence(request, admin, sparringId)
    expect(after.body).toMatchObject({
      startAt: zoneInstant(saturday, '10:00'),
      placeId: null,
      venue: { name: 'Stadion Wisły Liszki', address: 'ul. Sportowa 3, Liszki' },
      // DD-43: the gathering keeps its offset.
      gatheringAt: zoneInstant(saturday, '09:30'),
    })
    const homeId = String(homeVenue.body?.occurrenceId)
    const home = await getOccurrence(request, admin, homeId)
    const cancelled = await cancelOccurrence(
      request,
      coach.token,
      homeId,
      'Boisko zajęte',
      (home.body as { updatedAt?: string } | null)?.updatedAt,
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)

    // --- A session of a series of team A: the coach may not edit it ---
    const series = await postActivity(request, coordinator.token, {
      groupId: teamA,
      name: 'Trening Orlików',
      type: 'training',
      placeId: pitch,
      coachPersonId: coach.personId,
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=WE',
      startsOn: addDays(today, 1),
      startTime: '17:00',
      endTime: '18:00',
    })
    expect(series.status, JSON.stringify(series.body)).toBe(201)
    const seriesSessions = await listOccurrences(request, admin, `&activityId=${String(series.body?.id)}`)
    const seriesSession = seriesSessions.items[0]
    expect(seriesSession).toBeDefined()
    const seriesItem = await readCalendarItem(request, coach.token, seriesSession.id, 'as=coach')
    expect((seriesItem.body as unknown as { mayEdit?: boolean }).mayEdit).toBe(false)
    const refused = await moveOccurrence(
      request,
      coach.token,
      seriesSession.id,
      { startAt: seriesSession.startAt, endAt: seriesSession.endAt, venue: VENUE },
      seriesSession.updatedAt,
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body?.code).toBe('coach_edit_series_session')
    // The coordinator may move it, but never to a typed venue.
    const seriesVenue = await moveOccurrence(
      request,
      coordinator.token,
      seriesSession.id,
      { startAt: seriesSession.startAt, endAt: seriesSession.endAt, venue: VENUE },
      seriesSession.updatedAt,
    )
    expect(seriesVenue.status, JSON.stringify(seriesVenue.body)).toBe(422)
    expect(seriesVenue.body?.code).toBe('venue_requires_one_off')
  } finally {
    await club.cleanup()
  }
})
