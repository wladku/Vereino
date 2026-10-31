import { expect, test } from '@playwright/test'
import {
  bothSeries,
  calendarItems,
  declare,
  entryOf,
  familyFor,
  firstSession,
  guardianDecide,
  oneOff,
  personOf,
} from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'

// Issue #32, club spec TEST-011 (REQ-007; security) and phase 2 step 5, the guardian part: the record scope decides
// whose declaration it is. Another family's guardian, or the ward's own sibling, cannot declare for our child (403
// `scope_denied`); the coach of Żaki declares for a participant of Żaki as staff (`source: staff`, `actingRole: coach`)
// but not for a child of a group they do not coach (403); a pending guardian confirmation is decided by the ward's
// guardian only. The check-off part (REQ-008) arrives with #33.
test.describe.configure({ timeout: 300_000 })

test('TEST-011 another family and the sibling get 403 declaring for our child; the coach declares for their own group as staff and gets 403 for another group; only the guardian decides', async ({
  request,
}) => {
  const club = await createClub(request, 'test-011')
  try {
    const family = await familyFor(request, club)
    const { training, poolClass } = await bothSeries(request, club, family)
    const trainingSession = firstSession(training.sessions)
    const poolSession = firstSession(poolClass.sessions)
    const trainingDay = String(trainingSession.occurrenceDate)

    // Another family's guardian declaring for our 14-year-old: out of scope, nothing written.
    const foreignGuardian = await declare(request, family.other.guardian.token, {
      occurrenceId: trainingSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(foreignGuardian.status, JSON.stringify(foreignGuardian.body)).toBe(403)
    expect(foreignGuardian.body?.code).toBe('scope_denied')

    // The 16-year-old declaring for the sibling: a `self` grant covers one person only.
    const sibling = await declare(request, family.elder.token, {
      occurrenceId: trainingSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(sibling.status, JSON.stringify(sibling.body)).toBe(403)
    expect(sibling.body?.code).toBe('scope_denied')

    // The pool instructor has no grant on Żaki.
    const instructor = await declare(request, family.instructor.token, {
      occurrenceId: trainingSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(instructor.status, JSON.stringify(instructor.body)).toBe(403)
    expect(instructor.body?.code).toBe('scope_denied')

    const untouched = entryOf(
      await calendarItems(request, family.guardian.token, `from=${trainingDay}&to=${trainingDay}&as=guardian`),
      trainingSession.id,
    )
    expect(untouched.persons.every((person) => person.declaration === null)).toBe(true)

    // The coach of Żaki reports the other family's child absent: a staff declaration, final at once.
    const byCoach = await declare(request, family.coach.token, {
      occurrenceId: trainingSession.id,
      personId: family.other.child.personId,
      declared: 'no',
    })
    expect(byCoach.status, JSON.stringify(byCoach.body)).toBe(201)
    expect(byCoach.body).toMatchObject({
      personId: family.other.child.personId,
      declared: 'no',
      declarationStatus: 'final',
      declaredByPersonId: family.coach.personId,
      source: 'staff',
      actingRole: 'coach',
      created: true,
    })
    const otherFamilyView = entryOf(
      await calendarItems(request, family.other.guardian.token, `from=${trainingDay}&to=${trainingDay}&as=guardian`),
      trainingSession.id,
    )
    expect(personOf(otherFamilyView, family.other.child.personId).declaration).toMatchObject({
      attendanceId: byCoach.body?.id,
      declared: 'no',
      declarationStatus: 'final',
    })

    // The same coach for the 14-year-old's pool class: not their group.
    const coachElsewhere = await declare(request, family.coach.token, {
      occurrenceId: poolSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(coachElsewhere.status, JSON.stringify(coachElsewhere.body)).toBe(403)
    expect(coachElsewhere.body?.code).toBe('scope_denied')
    // The coordinator of the academy has no grant on the pool section either.
    const coordinatorElsewhere = await declare(request, family.academyCoordinator.token, {
      occurrenceId: poolSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(coordinatorElsewhere.status, JSON.stringify(coordinatorElsewhere.body)).toBe(403)
    expect(coordinatorElsewhere.body?.code).toBe('scope_denied')

    // A pending confirmation of the 16-year-old on a match is decided by their guardian only.
    const match = await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz ligowy',
      type: 'match',
      weekday: 'SA',
      fromDaysAhead: 2,
      start: '11:00',
      end: '12:30',
    })
    const pending = await declare(request, family.elder.token, {
      occurrenceId: match.session.id,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(pending.status, JSON.stringify(pending.body)).toBe(201)
    expect(pending.body?.declarationStatus).toBe('pending_guardian')
    const attendanceId = String(pending.body?.id)
    for (const [label, token] of [
      ['the other family', family.other.guardian.token],
      ['the coach', family.coach.token],
      ['the coordinator', family.academyCoordinator.token],
      ['the ward', family.elder.token],
    ] as const) {
      const refused = await guardianDecide(request, token, attendanceId, true, pending.body?.updatedAt)
      expect(refused.status, `${label}: ${JSON.stringify(refused.body)}`).toBe(403)
      expect(refused.body?.code, label).toBe('scope_denied')
    }
    const decided = await guardianDecide(request, family.guardian.token, attendanceId, false, pending.body?.updatedAt)
    expect(decided.status, JSON.stringify(decided.body)).toBe(200)
    expect(decided.body).toMatchObject({ declarationStatus: 'rejected_by_guardian', actingRole: 'guardian' })
    // A rejected declaration counts as unanswered for the coach.
    const coachView = entryOf(
      await calendarItems(request, family.coach.token, `from=${match.date}&to=${match.date}&as=coach`),
      match.session.id,
    )
    expect(coachView.summary).toEqual({
      kind: 'confirm',
      expected: 0,
      absent: 0,
      confirmed: 0,
      declined: 0,
      unanswered: 3,
    })
  } finally {
    await club.cleanup()
  }
})
