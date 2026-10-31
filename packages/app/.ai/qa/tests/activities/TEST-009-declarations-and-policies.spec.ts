import { expect, test } from '@playwright/test'
import { createEvent } from '../_fixtures/activities'
import {
  calendarItems,
  createPolicy,
  declare,
  entryOf,
  familyFor,
  firstSession,
  guardianDecide,
  hoursAfter,
  listPolicies,
  oneOff,
  personOf,
  readCalendarItem,
  runExpiry,
  updatePolicy,
  weeklySeries,
} from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'

// Issue #32, club spec TEST-009 (REQ-007, D-026) and phase 2 step 5: declarations under the club's `declaration_kinds`
// and the minor policies. A training is `absence_only`: a guardian's `yes` is refused (422) and a `no` makes the coach's
// summary count one absence while everyone else stays expected. A match is `confirm` under the default
// `guardian_confirm` policy for matches: the 16-year-old's own `yes` waits for the guardian (`pending_guardian`, counted
// as unanswered) until the guardian approves or the 24-hour limit applies the default through the expiry job; a `group`
// policy `guardian_only` on Żaki refuses the ward's own declaration (403) while the guardian declares; a decision on a
// settled declaration is 409; a session that has started takes no declaration (409); a person outside the session's
// group is refused (422).
test.describe.configure({ timeout: 300_000 })

const HOUR_MS = 3_600_000

test('TEST-009 absence_only training refuses yes and counts a no as absent; a match under guardian_confirm waits for the guardian, the decision or the expiry settles it; guardian_only refuses the ward; closed and non-participant declarations are refused', async ({
  request,
}) => {
  const club = await createClub(request, 'test-009')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const coordinator = family.academyCoordinator.token

    // The club starts with the default policies: the club `immediate`, matches `guardian_confirm` for 24 hours.
    const defaults = await listPolicies(request, admin)
    expect(defaults.status).toBe(200)
    expect(defaults.items.find((policy) => policy.scope === 'club')).toMatchObject({
      minorDeclarationMode: 'immediate',
    })
    expect(
      defaults.items.find((policy) => policy.scope === 'activity_type' && policy.activityType === 'match'),
    ).toMatchObject({
      minorDeclarationMode: 'guardian_confirm',
      confirmTimeoutHours: 24,
      defaultAfterTimeout: 'declared',
    })

    // --- The training (absence_only) ---
    const training = await weeklySeries(request, club, coordinator, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening Żaków',
      type: 'training',
      weekday: 'TU',
      start: '17:00',
      end: '18:30',
    })
    const trainingSession = firstSession(training.sessions)
    const trainingDay = String(trainingSession.occurrenceDate)
    const trainingWindow = `from=${trainingDay}&to=${trainingDay}`

    const yesOnTraining = await declare(request, family.guardian.token, {
      occurrenceId: trainingSession.id,
      personId: family.younger.personId,
      declared: 'yes',
    })
    expect(yesOnTraining.status, JSON.stringify(yesOnTraining.body)).toBe(422)
    expect(yesOnTraining.body?.code).toBe('declaration_kind_absence_only')

    const absence = await declare(request, family.guardian.token, {
      occurrenceId: trainingSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(absence.status, JSON.stringify(absence.body)).toBe(201)
    expect(absence.body).toMatchObject({
      occurrenceId: trainingSession.id,
      personId: family.younger.personId,
      declared: 'no',
      declarationStatus: 'final',
      declaredByPersonId: family.guardian.personId,
      pendingUntil: null,
      source: 'app',
      actingRole: 'guardian',
      created: true,
    })
    // The same declaration again is a change (200), not a second row.
    const absenceAgain = await declare(request, family.guardian.token, {
      occurrenceId: trainingSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(absenceAgain.status, JSON.stringify(absenceAgain.body)).toBe(200)
    expect(absenceAgain.body?.id).toBe(absence.body?.id)
    expect(absenceAgain.body?.created).toBe(false)

    // The coach's summary: one absence, the two others expected (undeclared members count as expected).
    const coachTraining = entryOf(
      await calendarItems(request, family.coach.token, `${trainingWindow}&as=coach`),
      trainingSession.id,
    )
    expect(coachTraining.declarationKind).toBe('absence_only')
    expect(coachTraining.summary).toEqual({
      kind: 'absence_only',
      expected: 2,
      absent: 1,
      confirmed: 0,
      declined: 0,
      unanswered: 0,
    })
    // The guardian sees the absence on the ward and nothing on the sibling.
    const guardianTraining = entryOf(
      await calendarItems(request, family.guardian.token, `${trainingWindow}&as=guardian`),
      trainingSession.id,
    )
    expect(personOf(guardianTraining, family.younger.personId).declaration).toMatchObject({
      attendanceId: absence.body?.id,
      declared: 'no',
      declarationStatus: 'final',
    })
    expect(personOf(guardianTraining, family.elder.personId).declaration).toBeNull()

    // --- The first match (confirm, guardian_confirm by the activity-type default) ---
    const match = await oneOff(request, club, coordinator, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz ligowy',
      type: 'match',
      weekday: 'SA',
      fromDaysAhead: 2,
      start: '11:00',
      end: '12:30',
    })
    const matchWindow = `from=${match.date}&to=${match.date}`

    // The 16-year-old sees the match as one that waits for the guardian after their own declaration.
    const elderBefore = entryOf(
      await calendarItems(request, family.elder.token, `${matchWindow}&as=self`),
      match.session.id,
    )
    expect(elderBefore.declarationKind).toBe('confirm')
    expect(personOf(elderBefore, family.elder.personId)).toMatchObject({
      declaration: null,
      canDeclare: true,
      needsGuardianConfirmation: true,
      guardianOnly: false,
    })

    const ownYes = await declare(request, family.elder.token, {
      occurrenceId: match.session.id,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(ownYes.status, JSON.stringify(ownYes.body)).toBe(201)
    expect(ownYes.body).toMatchObject({
      declared: 'yes',
      declarationStatus: 'pending_guardian',
      declaredByPersonId: family.elder.personId,
      source: 'app',
      actingRole: 'self',
    })
    const pendingUntil = String(ownYes.body?.pendingUntil)
    const declaredAt = String(ownYes.body?.declaredAt)
    expect(Date.parse(pendingUntil), JSON.stringify(ownYes.body)).not.toBeNaN()
    expect(Date.parse(pendingUntil) - Date.parse(declaredAt)).toBe(24 * HOUR_MS)
    const attendanceId = String(ownYes.body?.id)

    // Pending: the guardian's calendar shows it, the coach still counts the ward as unanswered.
    const guardianPending = await readCalendarItem(
      request,
      family.guardian.token,
      match.session.id,
      `as=guardian&personId=${family.elder.personId}`,
    )
    expect(guardianPending.status, JSON.stringify(guardianPending.body)).toBe(200)
    expect(guardianPending.body?.persons.map((person) => person.personId)).toEqual([family.elder.personId])
    expect(guardianPending.body?.persons[0]?.declaration).toMatchObject({
      attendanceId,
      declared: 'yes',
      declarationStatus: 'pending_guardian',
      pendingUntil,
      guardianDecidedAt: null,
    })
    const coachPending = entryOf(
      await calendarItems(request, family.coach.token, `${matchWindow}&as=coach`),
      match.session.id,
    )
    expect(coachPending.summary).toEqual({
      kind: 'confirm',
      expected: 0,
      absent: 0,
      confirmed: 0,
      declined: 0,
      unanswered: 3,
    })

    // The ward cannot decide for themself; the guardian approves and the declaration becomes final.
    const wardDecides = await guardianDecide(request, family.elder.token, attendanceId, true, ownYes.body?.updatedAt)
    expect(wardDecides.status, JSON.stringify(wardDecides.body)).toBe(403)
    expect(wardDecides.body?.code).toBe('scope_denied')
    // A decision without the declaration's version is refused (S5.2).
    const tokenless = await guardianDecide(request, family.guardian.token, attendanceId, true, null)
    expect(tokenless.status, JSON.stringify(tokenless.body)).toBe(400)
    expect(tokenless.body?.code).toBe('lock_token_required')
    const approved = await guardianDecide(request, family.guardian.token, attendanceId, true, ownYes.body?.updatedAt)
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    expect(approved.body).toMatchObject({
      id: attendanceId,
      declared: 'yes',
      declarationStatus: 'final',
      pendingUntil: null,
      actingRole: 'guardian',
    })
    expect(approved.body?.guardianDecidedAt).not.toBeNull()
    const coachConfirmed = entryOf(
      await calendarItems(request, family.coach.token, `${matchWindow}&as=coach`),
      match.session.id,
    )
    expect(coachConfirmed.summary).toEqual({
      kind: 'confirm',
      expected: 0,
      absent: 0,
      confirmed: 1,
      declined: 0,
      unanswered: 2,
    })
    // A decision on a settled declaration is refused.
    const decideAgain = await guardianDecide(
      request,
      family.guardian.token,
      attendanceId,
      false,
      approved.body?.updatedAt,
    )
    expect(decideAgain.status, JSON.stringify(decideAgain.body)).toBe(409)
    expect(decideAgain.body?.code).toBe('guardian_decision_not_pending')

    // --- The second match: the expiry job applies the default after the limit ---
    const match2 = await oneOff(request, club, coordinator, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz ligowy — rewanż',
      type: 'match',
      weekday: 'SA',
      fromDaysAhead: 9,
      start: '11:00',
      end: '12:30',
    })
    const match2Window = `from=${match2.date}&to=${match2.date}`
    const ownYes2 = await declare(request, family.elder.token, {
      occurrenceId: match2.session.id,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(ownYes2.status, JSON.stringify(ownYes2.body)).toBe(201)
    expect(ownYes2.body?.declarationStatus).toBe('pending_guardian')
    const attendance2Id = String(ownYes2.body?.id)

    // 23 hours later nothing is due; 25 hours later the declaration stands (`defaultAfterTimeout: declared`).
    const early = runExpiry(club, hoursAfter(String(ownYes2.body?.declaredAt), 23))
    expect(early).toMatchObject({ processed: 0, failed: 0 })
    expect(early.changedIds).not.toContain(attendance2Id)
    const expired = runExpiry(club, hoursAfter(String(ownYes2.body?.declaredAt), 25))
    expect(expired, JSON.stringify(expired)).toMatchObject({ processed: 1, failed: 0 })
    expect(expired.changedIds).toEqual([attendance2Id])
    const guardianExpired = entryOf(
      await calendarItems(request, family.guardian.token, `${match2Window}&as=guardian`),
      match2.session.id,
    )
    expect(personOf(guardianExpired, family.elder.personId).declaration).toMatchObject({
      attendanceId: attendance2Id,
      declared: 'yes',
      declarationStatus: 'final',
      pendingUntil: null,
    })
    expect(personOf(guardianExpired, family.elder.personId).declaration?.guardianDecidedAt).not.toBeNull()
    // A second run changes nothing (the retry re-emits nothing).
    const again = runExpiry(club, hoursAfter(String(ownYes2.body?.declaredAt), 26))
    expect(again).toMatchObject({ processed: 0, failed: 0, changedIds: [] })
    const expiredDecision = await guardianDecide(
      request,
      family.guardian.token,
      attendance2Id,
      true,
      personOf(guardianExpired, family.elder.personId).declaration?.updatedAt,
    )
    expect(expiredDecision.status).toBe(409)
    expect(expiredDecision.body?.code).toBe('guardian_decision_not_pending')

    // --- A group policy `guardian_only` on Żaki: the ward is refused, the guardian declares ---
    const groupPolicyId = await createPolicy(request, admin, {
      scope: 'group',
      groupId: family.zaki,
      minorDeclarationMode: 'guardian_only',
    })
    const elderLocked = entryOf(
      await calendarItems(request, family.elder.token, `${match2Window}&as=self`),
      match2.session.id,
    )
    expect(personOf(elderLocked, family.elder.personId)).toMatchObject({
      canDeclare: false,
      needsGuardianConfirmation: false,
      guardianOnly: true,
    })
    const wardRefused = await declare(request, family.elder.token, {
      occurrenceId: match2.session.id,
      personId: family.elder.personId,
      declared: 'no',
    })
    expect(wardRefused.status, JSON.stringify(wardRefused.body)).toBe(403)
    expect(wardRefused.body?.code).toBe('declaration_guardian_only')
    // The refusal wrote nothing: the ward's earlier `yes` stands.
    const stillYes = entryOf(
      await calendarItems(request, family.guardian.token, `${match2Window}&as=guardian`),
      match2.session.id,
    )
    expect(personOf(stillYes, family.elder.personId).declaration).toMatchObject({
      declared: 'yes',
      declarationStatus: 'final',
    })
    const guardianForYounger = await declare(request, family.guardian.token, {
      occurrenceId: match2.session.id,
      personId: family.younger.personId,
      declared: 'yes',
    })
    expect(guardianForYounger.status, JSON.stringify(guardianForYounger.body)).toBe(201)
    expect(guardianForYounger.body).toMatchObject({ declarationStatus: 'final', actingRole: 'guardian', source: 'app' })

    // The policy is changed with its lock token: `immediate` lets the ward declare finally; a stale token is refused.
    const policies = await listPolicies(request, admin, `&groupId=${family.zaki}`)
    const groupPolicy = policies.items.find((policy) => policy.id === groupPolicyId)
    expect(groupPolicy, JSON.stringify(policies.items)).toMatchObject({
      scope: 'group',
      groupName: 'Żaki',
      minorDeclarationMode: 'guardian_only',
    })
    const relaxed = await updatePolicy(
      request,
      admin,
      { id: groupPolicyId, minorDeclarationMode: 'immediate' },
      groupPolicy?.updatedAt,
    )
    expect(relaxed.status, JSON.stringify(relaxed.body)).toBe(200)
    expect(relaxed.body?.actingRole).toBe('club_admin')
    const stale = await updatePolicy(
      request,
      admin,
      { id: groupPolicyId, minorDeclarationMode: 'guardian_confirm' },
      groupPolicy?.updatedAt,
    )
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect(stale.body?.code).toBe('optimistic_lock_conflict')
    const ownNo = await declare(request, family.elder.token, {
      occurrenceId: match2.session.id,
      personId: family.elder.personId,
      declared: 'no',
    })
    expect(ownNo.status, JSON.stringify(ownNo.body)).toBe(200)
    expect(ownNo.body).toMatchObject({
      id: attendance2Id,
      declared: 'no',
      declarationStatus: 'final',
      pendingUntil: null,
    })

    // --- A session that has started takes no declaration ---
    const now = Date.now()
    const started = await createEvent(request, admin, {
      groupId: family.zaki,
      type: 'other',
      name: 'Zbiórka przed wyjazdem',
      placeId: family.lockerRoom,
      startsAt: new Date(now - 10 * 60_000).toISOString(),
      endsAt: new Date(now + 50 * 60_000).toISOString(),
    })
    expect(started.status, JSON.stringify(started.body)).toBe(201)
    const startedId = String(started.body?.occurrenceId)
    const closed = await declare(request, family.guardian.token, {
      occurrenceId: startedId,
      personId: family.elder.personId,
      declared: 'no',
    })
    expect(closed.status, JSON.stringify(closed.body)).toBe(409)
    expect(closed.body?.code).toBe('declaration_closed')
    const startedEntry = await readCalendarItem(request, family.guardian.token, startedId, 'as=guardian')
    expect(startedEntry.status, JSON.stringify(startedEntry.body)).toBe(200)
    expect(startedEntry.body?.declarationsOpen).toBe(false)
    expect(startedEntry.body?.persons.every((person) => !person.canDeclare)).toBe(true)

    // --- A person who is not in the session's group ---
    const poolClass = await weeklySeries(request, club, family.poolCoordinator.token, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Nauka pływania',
      type: 'training',
      weekday: 'TH',
      start: '18:00',
      end: '19:00',
    })
    const notParticipant = await declare(request, family.guardian.token, {
      occurrenceId: firstSession(poolClass.sessions).id,
      personId: family.elder.personId,
      declared: 'no',
    })
    expect(notParticipant.status, JSON.stringify(notParticipant.body)).toBe(422)
    expect(notParticipant.body?.code).toBe('declaration_not_participant')
  } finally {
    await club.cleanup()
  }
})
