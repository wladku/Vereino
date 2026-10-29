import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  createEvent,
  deleteActivity,
  getActivity,
  getOccurrence,
  juneThirtiethNextYear,
  listActivities,
  listOccurrences,
  moveOccurrence,
  nextWeekday,
  postActivity,
  preview,
  scheduleFor,
  updateActivity,
  zoneInstant,
} from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'

// Issue #31 (E03-S02): the record scope of activities and sessions (a coordinator plans and reads only their sections;
// a coach without `activities.view` reads no list), two clubs that never see or change each other's schedule, and the
// coded refusals of an activity write (an unsupported rule, inverted times, a team-only type for a class group, a place
// with children, a delete of an activity with history).
test.describe.configure({ timeout: 300_000 })

test("E03-S02 a coordinator of another section cannot plan, move, cancel or read the section's activities; a coach without activities.view reads no list", async ({
  request,
}) => {
  const club = await createClub(request, 'e03-s02-scope')
  try {
    const admin = club.adminToken
    const { academy, pitch, zaki, coordinator } = await scheduleFor(request, club)
    const pool = await createStructure(request, admin, 'sections', { name: 'Basen' })
    const swim = await createGroup(request, admin, { sectionId: pool, name: 'Nauka pływania', kind: 'class_group' })
    const today = calendarDate()
    const until = juneThirtiethNextYear(today).until
    const weekly = (groupId: string, name: string, byDay: string, startTime: string, endTime: string) => ({
      groupId,
      name,
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${until}`,
      startsOn: today,
      startTime,
      endTime,
    })
    // The academy's series by its coordinator; the pool's series by the administrator.
    const own = await createActivity(request, coordinator, weekly(zaki, 'Trening Żaków', 'TU', '17:00', '18:30'))
    const foreign = await createActivity(request, admin, weekly(swim, 'Nauka pływania', 'WE', '17:00', '18:00'))
    const foreignSessions = (await listOccurrences(request, admin, `&activityId=${foreign.id}`)).items
    const foreignSession = foreignSessions.at(0)
    if (!foreignSession) throw new Error('[internal] the pool series has no session')
    const foreignActivity = await getActivity(request, admin, foreign.id)
    expect(foreignActivity.body?.actingRole).toBe('club_admin')

    // Writes in the other section: 403 scope_denied, nothing changes.
    const created = await postActivity(request, coordinator, weekly(swim, 'Przejęte zajęcia', 'TH', '17:00', '18:00'))
    expect(created.status, JSON.stringify(created.body)).toBe(403)
    expect(created.body?.code).toBe('scope_denied')
    const previewed = await preview(request, coordinator, weekly(swim, 'Podgląd', 'TH', '17:00', '18:00'))
    expect(previewed.status, JSON.stringify(previewed.body)).toBe(403)
    expect(previewed.body?.code).toBe('scope_denied')
    const updated = await updateActivity(
      request,
      coordinator,
      { id: foreign.id, startTime: '18:00', endTime: '19:00' },
      foreignActivity.body?.updatedAt,
    )
    expect(updated.status, JSON.stringify(updated.body)).toBe(403)
    const deleted = await deleteActivity(request, coordinator, foreign.id, foreignActivity.body?.updatedAt)
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(403)
    const moved = await moveOccurrence(
      request,
      coordinator,
      foreignSession.id,
      {
        startAt: zoneInstant(String(foreignSession.occurrenceDate), '19:00'),
        endAt: zoneInstant(String(foreignSession.occurrenceDate), '20:00'),
      },
      foreignSession.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(403)
    expect(moved.body?.code).toBe('scope_denied')
    const cancelled = await cancelOccurrence(
      request,
      coordinator,
      foreignSession.id,
      'Nie moje',
      foreignSession.updatedAt,
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(403)
    expect(cancelled.body?.code).toBe('scope_denied')
    expect((await getOccurrence(request, admin, foreignSession.id)).body).toMatchObject({
      status: 'planned',
      isDetached: false,
      startAt: foreignSession.startAt,
    })
    expect((await getActivity(request, admin, foreign.id)).body).toMatchObject({ startTime: '17:00', isActive: true })

    // Reads: the lists hold only the academy's records, the pool's records answer 403 on detail.
    const activities = await listActivities(request, coordinator)
    expect(activities.status).toBe(200)
    expect(activities.items.map((item) => item.id)).toEqual([own.id])
    const sessions = await listOccurrences(request, coordinator)
    expect(sessions.status).toBe(200)
    expect(sessions.items.length).toBeGreaterThan(0)
    expect(new Set(sessions.items.map((item) => item.sectionId))).toEqual(new Set([academy]))
    expect((await listOccurrences(request, coordinator, `&groupId=${swim}`)).items).toEqual([])
    const foreignDetail = await getActivity(request, coordinator, foreign.id)
    expect(foreignDetail.status).toBe(403)
    expect(foreignDetail.body?.code).toBe('scope_denied')
    expect((await getOccurrence(request, coordinator, foreignSession.id)).status).toBe(403)
    // The administrator reads both sections.
    expect((await listActivities(request, admin)).items.map((item) => item.id).sort()).toEqual(
      [own.id, foreign.id].sort(),
    )

    // A coach of Żaki has no `activities.view`: every read of the module answers 403 by feature.
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, { groupId: zaki, personId: coach.personId, role: 'coach', validFrom: today })
    expect((await listActivities(request, coach.token)).status).toBe(403)
    expect((await listOccurrences(request, coach.token)).status).toBe(403)
    expect((await getActivity(request, coach.token, own.id)).status).toBe(403)
  } finally {
    await club.cleanup()
  }
})

test("E03-S02 two clubs never see or change each other's activities and sessions", async ({ request }) => {
  const club = await createClub(request, 'e03-s02-tenant-a')
  const other = await createClub(request, 'e03-s02-tenant-b')
  try {
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const today = calendarDate()
    const { id: activityId } = await createActivity(request, coordinator, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const activity = await getActivity(request, club.adminToken, activityId)
    const session = (await listOccurrences(request, club.adminToken, `&activityId=${activityId}`)).items.at(0)
    if (!session) throw new Error('[internal] the series has no session')

    const otherToken = other.adminToken
    const otherSection = await createStructure(request, otherToken, 'sections', { name: 'Szachy' })
    const otherGroup = await createGroup(request, otherToken, {
      sectionId: otherSection,
      name: 'Szachiści',
      kind: 'class_group',
    })
    const otherPlace = await createStructure(request, otherToken, 'places', { name: 'Sala szachowa', kind: 'hall' })

    // Nothing of the first club is listed or readable.
    const activities = await listActivities(request, otherToken)
    expect(activities.status).toBe(200)
    expect(activities.items).toEqual([])
    const sessions = await listOccurrences(request, otherToken)
    expect(sessions.status).toBe(200)
    expect(sessions.items).toEqual([])
    expect((await listOccurrences(request, otherToken, `&activityId=${activityId}`)).items).toEqual([])
    expect((await getActivity(request, otherToken, activityId)).status).toBe(404)
    expect((await getOccurrence(request, otherToken, session.id)).status).toBe(404)

    // Writes with the first club's ids are refused and change nothing.
    const update = await updateActivity(
      request,
      otherToken,
      { id: activityId, name: 'Przejęte' },
      activity.body?.updatedAt,
    )
    expect(update.status, JSON.stringify(update.body)).toBe(404)
    expect((await deleteActivity(request, otherToken, activityId, activity.body?.updatedAt)).status).toBe(404)
    const move = await moveOccurrence(
      request,
      otherToken,
      session.id,
      {
        startAt: zoneInstant(String(session.occurrenceDate), '19:00'),
        endAt: zoneInstant(String(session.occurrenceDate), '20:00'),
      },
      session.updatedAt,
    )
    expect(move.status, JSON.stringify(move.body)).toBe(404)
    const cancel = await cancelOccurrence(request, otherToken, session.id, 'Przejęte', session.updatedAt)
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(404)
    // The first club's group or place is no reference in the second club.
    const foreignGroup = await postActivity(request, otherToken, {
      groupId: zaki,
      name: 'Przejęte zajęcia',
      type: 'training',
      placeId: otherPlace,
      startsOn: addDays(today, 7),
      startTime: '17:00',
      endTime: '18:00',
    })
    expect(foreignGroup.status, JSON.stringify(foreignGroup.body)).toBe(422)
    expect(foreignGroup.body?.code).toBe('activities_reference_invalid')
    const foreignPlace = await postActivity(request, otherToken, {
      groupId: otherGroup,
      name: 'Na cudzym boisku',
      type: 'training',
      placeId: pitch,
      startsOn: addDays(today, 7),
      startTime: '17:00',
      endTime: '18:00',
    })
    expect(foreignPlace.status, JSON.stringify(foreignPlace.body)).toBe(404)
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const foreignEvent = await createEvent(request, otherToken, {
      groupId: zaki,
      type: 'tournament',
      name: 'Turniej',
      placeId: otherPlace,
      startsAt: zoneInstant(saturday, '09:00'),
      endsAt: zoneInstant(saturday, '12:00'),
    })
    expect(foreignEvent.status, JSON.stringify(foreignEvent.body)).toBe(422)
    expect(foreignEvent.body?.code).toBe('activities_reference_invalid')

    const after = await getActivity(request, club.adminToken, activityId)
    expect(after.body).toMatchObject({ name: 'Trening Żaków', updatedAt: activity.body?.updatedAt })
    expect((await getOccurrence(request, club.adminToken, session.id)).body).toMatchObject({
      status: 'planned',
      startAt: session.startAt,
      updatedAt: session.updatedAt,
    })
    expect((await listActivities(request, otherToken)).items).toEqual([])
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})

test('E03-S02 refused writes: unsupported rule, inverted times, match for a class group, a place with children, delete of an activity with history', async ({
  request,
}) => {
  const club = await createClub(request, 'e03-s02-validation')
  try {
    const admin = club.adminToken
    const { academy, pitch, zaki, coordinator } = await scheduleFor(request, club)
    const classGroup = await createGroup(request, admin, {
      sectionId: academy,
      name: 'Zajęcia ogólnorozwojowe',
      kind: 'class_group',
    })
    const today = calendarDate()
    const until = juneThirtiethNextYear(today).until
    const base = {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    }

    const daily = await postActivity(request, coordinator, { ...base, recurrenceRule: 'FREQ=DAILY' })
    expect(daily.status, JSON.stringify(daily.body)).toBe(422)
    expect(daily.body?.code).toBe('recurrence_unsupported')
    const inverted = await postActivity(request, coordinator, { ...base, startTime: '18:30', endTime: '17:00' })
    expect(inverted.status, JSON.stringify(inverted.body)).toBe(422)
    expect(inverted.body?.code).toBe('activity_times_inverted')
    const match = await postActivity(request, coordinator, { ...base, groupId: classGroup, type: 'match' })
    expect(match.status, JSON.stringify(match.body)).toBe(422)
    expect(match.body?.code).toBe('activity_type_requires_team')
    const complex = await createStructure(request, admin, 'places', { name: 'Orlik 2024', kind: 'complex' })
    await createStructure(request, admin, 'places', { name: 'Boisko 1', kind: 'pitch', parentPlaceId: complex })
    const parent = await postActivity(request, coordinator, { ...base, placeId: complex })
    expect(parent.status, JSON.stringify(parent.body)).toBe(422)
    expect(parent.body?.code).toBe('place_not_bookable')
    const unknownPlace = await postActivity(request, coordinator, { ...base, placeId: randomUUID() })
    expect(unknownPlace.status, JSON.stringify(unknownPlace.body)).toBe(404)
    const ended = await postActivity(request, coordinator, {
      ...base,
      startsOn: addDays(today, -60),
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${addDays(today, -1).replaceAll('-', '')}`,
    })
    expect(ended.status, JSON.stringify(ended.body)).toBe(422)
    expect(ended.body?.code).toBe('activity_no_sessions')
    // The same refusals in the preview.
    const previewDaily = await preview(request, coordinator, { ...base, recurrenceRule: 'FREQ=DAILY' })
    expect(previewDaily.status).toBe(422)
    expect(previewDaily.body?.code).toBe('recurrence_unsupported')
    expect((await listActivities(request, coordinator)).items).toEqual([])

    // An activity with a cancelled session keeps its history: 409, nothing deleted.
    const withHistory = await createActivity(request, coordinator, base)
    const first = (await listOccurrences(request, coordinator, `&activityId=${withHistory.id}`)).items.at(0)
    if (!first) throw new Error('[internal] the series has no session')
    expect((await cancelOccurrence(request, coordinator, first.id, 'Mróz', first.updatedAt)).status).toBe(200)
    const historyRecord = await getActivity(request, coordinator, withHistory.id)
    const refusedDelete = await deleteActivity(request, coordinator, withHistory.id, historyRecord.body?.updatedAt)
    expect(refusedDelete.status, JSON.stringify(refusedDelete.body)).toBe(409)
    expect(refusedDelete.body?.code).toBe('activity_has_sessions')
    expect((await getActivity(request, coordinator, withHistory.id)).status).toBe(200)
    expect((await listOccurrences(request, coordinator, `&activityId=${withHistory.id}`)).total).toBe(
      withHistory.sessionsCreated,
    )

    // A fresh activity is deleted with its sessions.
    const fresh = await createActivity(request, coordinator, {
      ...base,
      name: 'Trening czwartkowy',
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TH;UNTIL=${until}`,
    })
    expect(fresh.sessionsCreated).toBeGreaterThan(0)
    const freshRecord = await getActivity(request, coordinator, fresh.id)
    const removed = await deleteActivity(request, coordinator, fresh.id, freshRecord.body?.updatedAt)
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    expect((await getActivity(request, coordinator, fresh.id)).status).toBe(404)
    expect((await listOccurrences(request, coordinator, `&activityId=${fresh.id}`)).items).toEqual([])
    expect((await listActivities(request, coordinator)).items.map((item) => item.id)).toEqual([withHistory.id])
  } finally {
    await club.cleanup()
  }
})
