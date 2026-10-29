import { expect, test } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  getOccurrence,
  juneThirtiethNextYear,
  listOccurrences,
  moveOccurrence,
  nextWeekday,
  postActivity,
  readNotifications,
  scheduleFor,
  zoneInstant,
  type CodedError,
  type OccurrenceItem,
} from '../_fixtures/activities'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  signInAs,
} from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'

// Issue #31 (E03-S02), club spec TEST-012 and glossary *Session conflict* / *Session cancellation*: on a place, its
// ancestors and its descendants the planned sessions in use at one instant never exceed the place's `capacity_groups`;
// a coach leads one session at a time; touching sessions do not conflict; every save (create, move) over a conflict is
// refused with 409 and the conflicting sessions. A cancelled session notifies, in the app, the participants with an
// account, the guardians of minors and the coaches — never the user who cancelled.
test.describe.configure({ timeout: 300_000 })

/** The ids of the stored sessions a 409 lists. */
function conflictingIds(body: CodedError | null): string[] {
  return (body?.conflicts ?? []).flatMap((conflict) => conflict.sessions.map((session) => session.id)).sort()
}

async function onlySession(
  request: Parameters<typeof listOccurrences>[0],
  token: string,
  activityId: string,
): Promise<OccurrenceItem> {
  const { items } = await listOccurrences(request, token, `&activityId=${activityId}`)
  expect(items).toHaveLength(1)
  return items[0]
}

test('TEST-012 conflicts: capacity over the place tree, capacity 2, touching times, a coach booked twice and a move onto a taken slot', async ({
  request,
}) => {
  const club = await createClub(request, 'test-012-conflicts')
  try {
    const admin = club.adminToken
    const { academy, zaki, orliki, coordinator } = await scheduleFor(request, club)
    const trampkarze = await createGroup(request, admin, { sectionId: academy, name: 'Trampkarze', kind: 'team' })
    const complex = await createStructure(request, admin, 'places', { name: 'Orlik 2024', kind: 'complex' })
    const pitch = await createStructure(request, admin, 'places', {
      name: 'Boisko 1',
      kind: 'pitch',
      parentPlaceId: complex,
      capacityGroups: 1,
    })
    const today = calendarDate()
    const wednesday = nextWeekday(addDays(today, 7), 'WE')
    const oneOff = (groupId: string, placeId: string, day: string, startTime: string, endTime: string) => ({
      groupId,
      name: `Zajęcia ${startTime}`,
      type: 'training',
      placeId,
      startsOn: day,
      startTime,
      endTime,
    })

    // A planned session of Żaki on the pitch, 17:00–18:30.
    const zakiActivity = await createActivity(request, coordinator, oneOff(zaki, pitch, wednesday, '17:00', '18:30'))
    const zakiSession = await onlySession(request, coordinator, zakiActivity.id)

    // A weekly Orliki series overlapping it on the pitch (17:30–19:00) is refused, naming the Żaki session.
    const overlapping = await postActivity(request, coordinator, {
      groupId: orliki,
      name: 'Trening Orlików',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=WE;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: wednesday,
      startTime: '17:30',
      endTime: '19:00',
    })
    expect(overlapping.status, JSON.stringify(overlapping.body)).toBe(409)
    expect(overlapping.body?.code).toBe('occurrence_place_conflict')
    expect(overlapping.body?.conflicts?.map((conflict) => [conflict.key, conflict.kind])).toEqual([
      [wednesday, 'place'],
    ])
    expect(conflictingIds(overlapping.body)).toEqual([zakiSession.id])
    expect((await listOccurrences(request, coordinator, `&groupId=${orliki}`)).items).toEqual([])

    // Touching times do not conflict: 18:30 end, 18:30 start.
    const touching = await createActivity(request, coordinator, oneOff(orliki, pitch, wednesday, '18:30', '20:00'))
    const touchingSession = await onlySession(request, coordinator, touching.id)

    // Moving the touching session onto the taken slot (18:00–19:30) is refused; the session stays where it was.
    const takenStart = zoneInstant(wednesday, '18:00')
    const takenEnd = zoneInstant(wednesday, '19:30')
    const refusedMove = await moveOccurrence(
      request,
      coordinator,
      touchingSession.id,
      { startAt: takenStart, endAt: takenEnd },
      touchingSession.updatedAt,
    )
    expect(refusedMove.status, JSON.stringify(refusedMove.body)).toBe(409)
    expect(refusedMove.body?.code).toBe('occurrence_place_conflict')
    expect(conflictingIds(refusedMove.body)).toEqual([zakiSession.id])
    expect((await getOccurrence(request, coordinator, touchingSession.id)).body).toMatchObject({
      startAt: touchingSession.startAt,
      endAt: touchingSession.endAt,
      isDetached: false,
    })

    // The place tree: a session on a complex booked while it was still a leaf blocks its new child (an ancestor), and
    // the child's session blocks a move of the complex's session (a descendant).
    const hall = await createStructure(request, admin, 'places', { name: 'Hala sportowa', kind: 'complex' })
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const onHall = await createActivity(request, coordinator, oneOff(zaki, hall, saturday, '10:00', '12:00'))
    const hallSession = await onlySession(request, coordinator, onHall.id)
    const court = await createStructure(request, admin, 'places', {
      name: 'Sala A',
      kind: 'hall',
      parentPlaceId: hall,
      capacityGroups: 1,
    })
    const underParent = await postActivity(request, coordinator, oneOff(orliki, court, saturday, '11:00', '12:30'))
    expect(underParent.status, JSON.stringify(underParent.body)).toBe(409)
    expect(underParent.body?.code).toBe('occurrence_place_conflict')
    expect(conflictingIds(underParent.body)).toEqual([hallSession.id])
    const onCourt = await createActivity(request, coordinator, oneOff(orliki, court, saturday, '13:00', '14:00'))
    const courtSession = await onlySession(request, coordinator, onCourt.id)
    const hallMove = await moveOccurrence(
      request,
      coordinator,
      hallSession.id,
      { startAt: zoneInstant(saturday, '13:30'), endAt: zoneInstant(saturday, '15:00') },
      hallSession.updatedAt,
    )
    expect(hallMove.status, JSON.stringify(hallMove.body)).toBe(409)
    expect(hallMove.body?.code).toBe('occurrence_place_conflict')
    expect(conflictingIds(hallMove.body)).toEqual([courtSession.id])
    // The complex now has a child: it takes no new session.
    const onParent = await postActivity(request, coordinator, oneOff(trampkarze, hall, saturday, '16:00', '17:00'))
    expect(onParent.status, JSON.stringify(onParent.body)).toBe(422)
    expect(onParent.body?.code).toBe('place_not_bookable')

    // A place for two groups at once accepts one overlap and refuses the third session.
    const pool = await createStructure(request, admin, 'places', { name: 'Pływalnia', kind: 'pool', capacityGroups: 2 })
    const thursday = nextWeekday(addDays(today, 7), 'TH')
    const firstOnPool = await createActivity(request, coordinator, oneOff(zaki, pool, thursday, '10:00', '11:00'))
    const secondOnPool = await createActivity(request, coordinator, oneOff(orliki, pool, thursday, '10:30', '11:30'))
    const thirdOnPool = await postActivity(request, coordinator, oneOff(trampkarze, pool, thursday, '10:45', '12:00'))
    expect(thirdOnPool.status, JSON.stringify(thirdOnPool.body)).toBe(409)
    expect(thirdOnPool.body?.code).toBe('occurrence_place_conflict')
    expect(conflictingIds(thirdOnPool.body)).toEqual(
      [
        (await onlySession(request, coordinator, firstOnPool.id)).id,
        (await onlySession(request, coordinator, secondOnPool.id)).id,
      ].sort(),
    )
    // After the second group leaves at 11:30 the pool has room again.
    await createActivity(request, coordinator, oneOff(trampkarze, pool, thursday, '11:30', '12:30'))

    // The same coach on two unrelated places at the same time: 409 occurrence_coach_conflict.
    const coachPerson = await createPerson(request, admin, {
      firstName: 'Marek',
      lastName: 'Trener',
      birthDate: birthDateTurning(40),
    })
    const pitch2 = await createStructure(request, admin, 'places', { name: 'Boisko 2', kind: 'pitch' })
    const pitch3 = await createStructure(request, admin, 'places', { name: 'Boisko 3', kind: 'pitch' })
    const friday = nextWeekday(addDays(today, 7), 'FR')
    const coached = await createActivity(request, coordinator, {
      ...oneOff(zaki, pitch2, friday, '16:00', '17:00'),
      coachPersonId: coachPerson,
    })
    const coachedSession = await onlySession(request, coordinator, coached.id)
    const doubleBooked = await postActivity(request, coordinator, {
      ...oneOff(orliki, pitch3, friday, '16:30', '17:30'),
      coachPersonId: coachPerson,
    })
    expect(doubleBooked.status, JSON.stringify(doubleBooked.body)).toBe(409)
    expect(doubleBooked.body?.code).toBe('occurrence_coach_conflict')
    expect(doubleBooked.body?.conflicts?.map((conflict) => conflict.kind)).toEqual(['coach'])
    expect(conflictingIds(doubleBooked.body)).toEqual([coachedSession.id])
    // Without that coach the same session is accepted.
    await createActivity(request, coordinator, oneOff(orliki, pitch3, friday, '16:30', '17:30'))
  } finally {
    await club.cleanup()
  }
})

test('TEST-012 cancellation: the guardian of a minor, a 14-year-old, an adult participant and the coach are notified in the app, not the coordinator who cancelled', async ({
  request,
}) => {
  const club = await createClub(request, 'test-012-cancel')
  try {
    const admin = club.adminToken
    // Own accounts from 13 (the club setting), so the 14-year-old participant has one.
    const settings = await call<{ updatedAt?: string | null }>(request, 'GET', '/api/club_core/settings', admin)
    const saved = await call(request, 'PUT', '/api/club_core/settings', admin, {
      data: { ownAccountMinAge: 13 },
      headers: settings.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: settings.body.updatedAt } : {},
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)

    const { pitch, zaki, coordinator, coordinatorPersonId } = await scheduleFor(request, club)
    const today = calendarDate()
    const since = addDays(today, -30)
    const child = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Kowalski',
      birthDate: birthDateTurning(8),
    })
    const guardian = await createStaff(request, club, {
      firstName: 'Anna',
      lastName: 'Kowalska',
      birthDate: birthDateTurning(38),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: guardian.personId,
      wardPersonId: child,
      relation: 'parent',
      isPrimaryPayer: true,
      validFrom: since,
    })
    const teen = await createStaff(request, club, {
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: birthDateTurning(14),
    })
    const adult = await createStaff(request, club, {
      firstName: 'Piotr',
      lastName: 'Dorosly',
      birthDate: birthDateTurning(19),
    })
    const coach = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Trener',
      birthDate: birthDateTurning(40),
    })
    for (const personId of [child, teen.personId, adult.personId]) {
      await addMembership(request, admin, { groupId: zaki, personId, role: 'participant', validFrom: since })
    }
    await addMembership(request, admin, { groupId: zaki, personId: coach.personId, role: 'coach', validFrom: since })

    // The coordinator leads the series herself, so she belongs to the audience — and still gets nothing for her own
    // cancellation.
    const { id: activityId } = await createActivity(request, coordinator, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      coachPersonId: coordinatorPersonId,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: addDays(today, 1),
      startTime: '17:00',
      endTime: '18:30',
    })
    const listed = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    const session = listed.at(0)
    const other = listed.at(1)
    if (!session || !other) throw new Error('[internal] the series has too few sessions')

    // Tokens of the people to notify (a password set for each; their earlier tokens are not used).
    const tokens = {
      guardian: await signInAs(request, club, guardian.userId, guardian.email),
      teen: await signInAs(request, club, teen.userId, teen.email),
      adult: await signInAs(request, club, adult.userId, adult.email),
      coach: await signInAs(request, club, coach.userId, coach.email),
    }

    const reason = 'Ulewa — boisko zamknięte'
    const cancelled = await cancelOccurrence(request, coordinator, session.id, reason, session.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect(cancelled.body).toMatchObject({ ok: true, id: session.id, status: 'cancelled', actingRole: 'coordinator' })
    expect((await getOccurrence(request, coordinator, session.id)).body).toMatchObject({
      status: 'cancelled',
      cancelReason: reason,
    })

    // The notice arrives after commit (a persistent subscriber): poll each recipient.
    const query = `&type=activities.occurrence_cancelled&sourceEntityId=${session.id}`
    for (const [who, token] of Object.entries(tokens)) {
      await expect
        .poll(async () => (await readNotifications(request, token, query)).length, {
          timeout: 30_000,
          message: `${who} has the cancellation notice`,
        })
        .toBe(1)
      const notice = (await readNotifications(request, token, query)).at(0)
      expect(notice).toMatchObject({ type: 'activities.occurrence_cancelled', sourceEntityId: session.id })
      expect(notice?.bodyVariables?.reason).toBe(reason)
    }
    // The coordinator who cancelled, and the administrator outside the group, have none.
    expect(await readNotifications(request, coordinator, query)).toEqual([])
    expect(await readNotifications(request, admin, query)).toEqual([])
    // The other session concerns nobody yet.
    expect(
      await readNotifications(
        request,
        tokens.guardian,
        `&type=activities.occurrence_cancelled&sourceEntityId=${other.id}`,
      ),
    ).toEqual([])

    // A cancelled session cannot be cancelled again.
    const current = await getOccurrence(request, coordinator, session.id)
    const again = await cancelOccurrence(request, coordinator, session.id, 'Jeszcze raz', current.body?.updatedAt)
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('invalid_transition')

    // A cancellation needs a reason.
    const noReason = await cancelOccurrence(request, coordinator, other.id, undefined, other.updatedAt)
    expect(noReason.status, JSON.stringify(noReason.body)).toBe(400)
    const blankReason = await cancelOccurrence(request, coordinator, other.id, '   ', other.updatedAt)
    expect(blankReason.status, JSON.stringify(blankReason.body)).toBe(400)
    expect((await getOccurrence(request, coordinator, other.id)).body?.status).toBe('planned')
  } finally {
    await club.cleanup()
  }
})
