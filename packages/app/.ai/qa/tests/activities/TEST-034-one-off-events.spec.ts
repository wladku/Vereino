import { expect, test } from '@playwright/test'
import {
  addDays,
  createEvent,
  getActivity,
  listActivities,
  listOccurrences,
  nextWeekday,
  zoneInstant,
} from '../_fixtures/activities'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'

// Issue #31 (E03-S02), club spec TEST-034, REQ-027 and phase 2 step 8: a coach creates a one-off `tournament` (or
// `other`) event for a group they coach without the coordinator — the club has no coordinator at all here. `match` and
// `sparring` stay team-only, other types are not one-off events, and a group the coach does not coach is out of scope.
// The participants' calendars arrive with step 4 (`GET /api/activities/calendar`); here the session is checked in the
// administrator's session list.
test.describe.configure({ timeout: 300_000 })

test('TEST-034 a coach of Orliki and of a class group creates tournaments for both without a coordinator; sparring for the class group, training as an event and a group they do not coach are refused', async ({
  request,
}) => {
  const club = await createClub(request, 'test-034-events')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const fitness = await createStructure(request, admin, 'sections', { name: 'Ogólnorozwojowe' })
    const orliki = await createGroup(request, admin, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const classGroup = await createGroup(request, admin, {
      sectionId: fitness,
      name: 'Gimnastyka — grupa C',
      kind: 'class_group',
    })
    const pitch = await createStructure(request, admin, 'places', { name: 'Boisko główne', kind: 'pitch' })
    const hall = await createStructure(request, admin, 'places', { name: 'Hala', kind: 'hall' })
    const invited: string[] = []
    for (const name of ['KS Polonia', 'UKS Orzeł']) {
      const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
        data: { name, clubName: name },
      })
      expect(team.status, JSON.stringify(team.body)).toBe(201)
      invited.push(String(team.body?.id))
    }

    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    const today = calendarDate()
    for (const groupId of [orliki, classGroup]) {
      await addMembership(request, admin, {
        groupId,
        personId: coach.personId,
        role: 'coach',
        validFrom: addDays(today, -30),
      })
    }
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const sunday = addDays(saturday, 1)

    // A Saturday tournament for Orliki with two invited external teams: the coach leads it, acting as coach.
    const tournament = await createEvent(request, coach.token, {
      groupId: orliki,
      type: 'tournament',
      name: 'Turniej Orlików',
      placeId: pitch,
      startsAt: zoneInstant(saturday, '09:00'),
      endsAt: zoneInstant(saturday, '15:00'),
      invitedExternalTeamIds: invited,
    })
    expect(tournament.status, JSON.stringify(tournament.body)).toBe(201)
    expect(tournament.body?.actingRole).toBe('coach')
    const eventId = String(tournament.body?.id)
    const occurrenceId = String(tournament.body?.occurrenceId)

    // The administrator sees the event and its one session in the group's schedule.
    const event = await getActivity(request, admin, eventId)
    expect(event.status).toBe(200)
    expect(event.body).toMatchObject({
      groupId: orliki,
      sectionId: academy,
      type: 'tournament',
      name: 'Turniej Orlików',
      placeId: pitch,
      coachPersonId: coach.personId,
      recurrenceRule: null,
      startsOn: saturday,
      startTime: '09:00',
      endTime: '15:00',
    })
    expect([...(event.body?.invitedExternalTeamIds ?? [])].sort()).toEqual([...invited].sort())
    const orlikiSessions = await listOccurrences(request, admin, `&groupId=${orliki}`)
    expect(orlikiSessions.status).toBe(200)
    expect(orlikiSessions.items).toHaveLength(1)
    expect(orlikiSessions.items[0]).toMatchObject({
      id: occurrenceId,
      activityId: eventId,
      occurrenceDate: saturday,
      startAt: zoneInstant(saturday, '09:00'),
      endAt: zoneInstant(saturday, '15:00'),
      placeId: pitch,
      coachPersonId: coach.personId,
      status: 'planned',
    })

    // A tournament for the class group is a one-off event too.
    const classTournament = await createEvent(request, coach.token, {
      groupId: classGroup,
      type: 'tournament',
      name: 'Zawody gimnastyczne',
      placeId: hall,
      startsAt: zoneInstant(sunday, '10:00'),
      endsAt: zoneInstant(sunday, '13:00'),
    })
    expect(classTournament.status, JSON.stringify(classTournament.body)).toBe(201)
    expect(classTournament.body?.actingRole).toBe('coach')
    expect((await listOccurrences(request, admin, `&groupId=${classGroup}`)).items.map((row) => row.id)).toEqual([
      classTournament.body?.occurrenceId,
    ])

    // `sparring` is team-only.
    const sparring = await createEvent(request, coach.token, {
      groupId: classGroup,
      type: 'sparring',
      name: 'Sparing',
      placeId: hall,
      startsAt: zoneInstant(sunday, '15:00'),
      endsAt: zoneInstant(sunday, '16:00'),
    })
    expect(sparring.status, JSON.stringify(sparring.body)).toBe(422)
    expect(sparring.body?.code).toBe('activity_type_requires_team')

    // A training is planned by the coordinator, not created as a one-off event.
    const training = await createEvent(request, coach.token, {
      groupId: orliki,
      type: 'training',
      name: 'Dodatkowy trening',
      placeId: pitch,
      startsAt: zoneInstant(sunday, '15:00'),
      endsAt: zoneInstant(sunday, '16:00'),
    })
    expect(training.status, JSON.stringify(training.body)).toBe(422)
    expect(training.body?.code).toBe('event_type_not_allowed')

    // Żaki is not the coach's group.
    const foreign = await createEvent(request, coach.token, {
      groupId: zaki,
      type: 'tournament',
      name: 'Turniej Żaków',
      placeId: pitch,
      startsAt: zoneInstant(sunday, '09:00'),
      endsAt: zoneInstant(sunday, '12:00'),
    })
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    expect(foreign.body?.code).toBe('scope_denied')

    // Only the two tournaments exist; the refused requests wrote nothing.
    const activities = await listActivities(request, admin)
    expect(activities.items.map((item) => item.id).sort()).toEqual([eventId, String(classTournament.body?.id)].sort())
    expect((await listOccurrences(request, admin, `&groupId=${zaki}`)).items).toEqual([])
  } finally {
    await club.cleanup()
  }
})
