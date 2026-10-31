import { expect, test } from '@playwright/test'
import { cancelOccurrence, getOccurrence, moveOccurrence } from '../_fixtures/activities'
import {
  addParticipants,
  bothSeries,
  declare,
  familyFor,
  firstSession,
  oneOff,
  readAttendanceList,
  rowOf,
  saveAttendanceList,
  startNow,
  upcoming,
  type ActualValue,
} from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'

// Issue #33 (E03-S04), club spec phase 2 step 5 — the check-off half of TEST-009 and TEST-011 (REQ-007, REQ-008; R11,
// D-026; AC-007): before the session the coach's list counts the expected and the reported absences of the kind; from
// the start the coach checks off present, absent or late and closes the session, each row recording who marked it and
// in which role; a save with a stale session version answers 409; a coach of another group gets 403; a cancelled
// session refuses the check-off with 409.
test.describe.configure({ timeout: 300_000 })

test('TEST-009 a training of sixteen with two reported absences: 14 expected, 2 absent; check-off after the start with the marker and role; stale save 409; close → done; another group’s coach 403', async ({
  request,
}) => {
  const club = await createClub(request, 'test-009-checkoff')
  try {
    const family = await familyFor(request, club)
    // Żaki has three participants from the family fixture; thirteen more make the sixteen of the acceptance criterion.
    const extra = await addParticipants(request, club, family.zaki, 13)
    const { training } = await bothSeries(request, club, family)
    const session = firstSession(training.sessions)

    // Two absences reported before the session (`absence_only` is the default kind of a training).
    for (const [token, personId] of [
      [family.guardian.token, family.younger.personId],
      [family.other.guardian.token, family.other.child.personId],
    ] as const) {
      const reported = await declare(request, token, { occurrenceId: session.id, personId, declared: 'no' })
      expect(reported.status, JSON.stringify(reported.body)).toBe(201)
    }

    // Before the session: the coach reads 14 expected and 2 absent; the check-off is not open yet.
    const before = await readAttendanceList(request, family.coach.token, session.id)
    expect(before.status, JSON.stringify(before.body)).toBe(200)
    const list = before.body
    if (!list) throw new Error('[test] empty list')
    expect(list.declarationKind).toBe('absence_only')
    expect(list.summary).toMatchObject({ kind: 'absence_only', expected: 14, absent: 2 })
    expect(list.checkOff).toBe('not_started')
    expect(list.actingRole).toBe('coach')
    expect(list.rows).toHaveLength(16)
    expect(rowOf(list, family.younger.personId).expectation).toBe('absent')
    expect(rowOf(list, family.elder.personId).expectation).toBe('expected')
    const early = await saveAttendanceList(
      request,
      family.coach.token,
      session.id,
      { entries: [{ personId: family.elder.personId, actual: 'present' }] },
      list.occurrence?.updatedAt,
    )
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('attendance_not_started')

    // A coach of another group (the pool instructor): 403 on the read and on the save.
    const foreignRead = await readAttendanceList(request, family.instructor.token, session.id)
    expect(foreignRead.status, JSON.stringify(foreignRead.body)).toBe(403)
    expect(foreignRead.body?.code).toBe('scope_denied')
    const foreignSave = await saveAttendanceList(
      request,
      family.instructor.token,
      session.id,
      { entries: [{ personId: family.elder.personId, actual: 'present' }] },
      list.occurrence?.updatedAt,
    )
    expect(foreignSave.status, JSON.stringify(foreignSave.body)).toBe(403)
    expect(foreignSave.body?.code).toBe('scope_denied')

    // The session starts; the coach checks off everyone.
    const startedVersion = await startNow(request, club, session.id)
    const open = await readAttendanceList(request, family.coach.token, session.id)
    expect(open.body?.checkOff).toBe('open')
    expect(open.body?.occurrence?.updatedAt).toBe(startedVersion)
    const marks = new Map<string, ActualValue>([
      [family.younger.personId, 'absent'],
      [family.other.child.personId, 'absent'],
      [family.elder.personId, 'late'],
      ...extra.map((personId): [string, ActualValue] => [personId, 'present']),
    ])
    const saved = await saveAttendanceList(
      request,
      family.coach.token,
      session.id,
      { entries: [...marks].map(([personId, actual]) => ({ personId, actual })) },
      startedVersion,
    )
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const afterSave = saved.body
    if (!afterSave) throw new Error('[test] empty list after the save')
    for (const [personId, actual] of marks) {
      expect(rowOf(afterSave, personId)).toMatchObject({
        actual,
        markedByPersonId: family.coach.personId,
        markedAsRole: 'coach',
      })
    }
    // The reported absences still count as before: the declarations are not touched by the check-off.
    expect(afterSave.summary).toMatchObject({ expected: 14, absent: 2 })
    expect(afterSave.occurrence?.updatedAt).not.toBe(startedVersion)

    // A second user saving the list they loaded before the coach's save: 409, nothing written.
    const stale = await saveAttendanceList(
      request,
      family.academyCoordinator.token,
      session.id,
      { entries: [{ personId: family.elder.personId, actual: 'present' }] },
      startedVersion,
    )
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect(stale.body?.code).toBe('optimistic_lock_conflict')
    const unchanged = await readAttendanceList(request, family.coach.token, session.id)
    expect(unchanged.body && rowOf(unchanged.body, family.elder.personId).actual).toBe('late')

    // Someone who is not on the list cannot be checked off (the guardian is not a participant of Żaki).
    const outsider = await saveAttendanceList(
      request,
      family.coach.token,
      session.id,
      { entries: [{ personId: family.guardian.personId, actual: 'present' }] },
      afterSave.occurrence?.updatedAt,
    )
    expect(outsider.status, JSON.stringify(outsider.body)).toBe(422)
    expect(outsider.body?.code).toBe('attendance_person_not_listed')

    // The coordinator corrects one row with the current version and closes the session.
    const closed = await saveAttendanceList(
      request,
      family.academyCoordinator.token,
      session.id,
      { entries: [{ personId: family.elder.personId, actual: 'present' }], complete: true },
      afterSave.occurrence?.updatedAt,
    )
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect(closed.body?.occurrence?.status).toBe('done')
    expect(closed.body?.checkOff).toBe('not_planned')
    expect(closed.body && rowOf(closed.body, family.elder.personId)).toMatchObject({
      actual: 'present',
      markedByPersonId: family.academyCoordinator.personId,
      markedAsRole: 'coordinator',
    })
    // An unchanged row keeps who marked it.
    expect(closed.body && rowOf(closed.body, family.younger.personId).markedAsRole).toBe('coach')
    const record = await getOccurrence(request, club.adminToken, session.id)
    expect(record.body?.status).toBe('done')

    // A closed session takes no more check-offs.
    const afterClose = await saveAttendanceList(
      request,
      family.coach.token,
      session.id,
      { entries: [{ personId: family.elder.personId, actual: 'late' }] },
      closed.body?.occurrence?.updatedAt,
    )
    expect(afterClose.status, JSON.stringify(afterClose.body)).toBe(409)
    expect(afterClose.body?.code).toBe('occurrence_not_planned')
  } finally {
    await club.cleanup()
  }
})

test('TEST-011 a cancelled session refuses the check-off (409); a match lists confirmed, declined and unanswered; the assigned coach of a re-staffed session reads its list as a coach', async ({
  request,
}) => {
  const club = await createClub(request, 'test-011-checkoff')
  try {
    const family = await familyFor(request, club)
    const { training, poolClass } = await bothSeries(request, club, family)

    // A cancelled session: 409, whatever its start.
    const cancelledSession = upcoming(training.sessions).at(1)
    if (!cancelledSession) throw new Error('[test] no second training')
    const cancelled = await cancelOccurrence(
      request,
      family.coach.token,
      cancelledSession.id,
      'Boisko zamknięte',
      cancelledSession.updatedAt,
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    const refused = await saveAttendanceList(
      request,
      family.coach.token,
      cancelledSession.id,
      { entries: [{ personId: family.elder.personId, actual: 'present' }] },
      cancelled.body?.updatedAt,
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('occurrence_not_planned')
    const cancelledList = await readAttendanceList(request, family.coach.token, cancelledSession.id)
    expect(cancelledList.body?.checkOff).toBe('not_planned')

    // A match (`confirm`): one confirmed, one declined, one without an answer.
    const match = await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz ligowy',
      type: 'match',
      weekday: 'SA',
      fromDaysAhead: 2,
      start: '10:00',
      end: '11:30',
    })
    for (const [token, personId, declared] of [
      [family.guardian.token, family.younger.personId, 'yes'],
      [family.other.guardian.token, family.other.child.personId, 'no'],
    ] as const) {
      const answered = await declare(request, token, { occurrenceId: match.session.id, personId, declared })
      expect(answered.status, JSON.stringify(answered.body)).toBe(201)
    }
    const matchList = await readAttendanceList(request, family.coach.token, match.session.id)
    expect(matchList.status, JSON.stringify(matchList.body)).toBe(200)
    expect(matchList.body?.summary).toMatchObject({ kind: 'confirm', confirmed: 1, declined: 1, unanswered: 1 })
    expect(matchList.body && rowOf(matchList.body, family.younger.personId).expectation).toBe('confirmed')
    expect(matchList.body && rowOf(matchList.body, family.elder.personId).expectation).toBe('unanswered')

    // The coach of Żaki assigned to a pool session (re-staffed by the pool coordinator) reads and checks off its list.
    const poolSession = firstSession(poolClass.sessions)
    const current = await getOccurrence(request, club.adminToken, poolSession.id)
    const restaffed = await moveOccurrence(
      request,
      family.poolCoordinator.token,
      poolSession.id,
      { coachPersonId: family.coach.personId },
      current.body?.updatedAt,
    )
    expect(restaffed.status, JSON.stringify(restaffed.body)).toBe(200)
    const assigned = await readAttendanceList(request, family.coach.token, poolSession.id)
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)
    expect(assigned.body?.actingRole).toBe('coach')
    const version = await startNow(request, club, poolSession.id)
    const marked = await saveAttendanceList(
      request,
      family.coach.token,
      poolSession.id,
      { entries: [{ personId: family.younger.personId, actual: 'present' }] },
      version,
    )
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    expect(marked.body && rowOf(marked.body, family.younger.personId)).toMatchObject({
      actual: 'present',
      markedAsRole: 'coach',
    })
  } finally {
    await club.cleanup()
  }
})
