// TEST-009 (unit part; club spec *Declaration*, *Declaration policy*; D-006, D-026): the policy resolver and its
// defaults, the declaration outcome per acting role and policy, the kind rule, the closing rule and the summary.
import { describe, expect, it } from '@jest/globals'
import {
  BUILT_IN_CLUB_POLICY,
  DEFAULT_POLICIES,
  declarationChoices,
  declarationOutcome,
  declarationSource,
  declarationSummary,
  declarationTransitions,
  declarationWindow,
  declaredAllowedForKind,
  effectiveDeclared,
  isMinorOn,
  policyKey,
  policyShapeProblem,
  resolvePolicy,
  timeoutStatus,
  type PolicyRow,
} from '../policy'

const policy = (overrides: Partial<PolicyRow>): PolicyRow => ({
  scope: 'club',
  groupId: null,
  activityType: null,
  minorDeclarationMode: 'immediate',
  confirmTimeoutHours: 24,
  defaultAfterTimeout: 'declared',
  ...overrides,
})

describe('declaration status table', () => {
  it('moves a pending declaration to final or rejected and nowhere else', () => {
    expect(declarationTransitions.canTransition('pending_guardian', 'final')).toBe(true)
    expect(declarationTransitions.canTransition('pending_guardian', 'rejected_by_guardian')).toBe(true)
    expect(declarationTransitions.canTransition('final', 'pending_guardian')).toBe(false)
    expect(declarationTransitions.canTransition('rejected_by_guardian', 'final')).toBe(false)
    expect(declarationTransitions.isEntry('final')).toBe(true)
    expect(declarationTransitions.isEntry('pending_guardian')).toBe(true)
    expect(declarationTransitions.isTerminal('final')).toBe(true)
  })
})

describe('policies', () => {
  it('ships the D-006 defaults', () => {
    expect(DEFAULT_POLICIES.map(policyKey)).toEqual([
      'club::',
      'activity_type::match',
      'activity_type::tournament',
      'activity_type::camp',
      'away_trip::',
    ])
    expect(BUILT_IN_CLUB_POLICY.minorDeclarationMode).toBe('immediate')
    expect(
      DEFAULT_POLICIES.filter((row) => row.scope !== 'club').every(
        (row) => row.minorDeclarationMode === 'guardian_confirm',
      ),
    ).toBe(true)
  })

  it('checks the scope fields of a policy', () => {
    expect(policyShapeProblem('club', null, null)).toBeNull()
    expect(policyShapeProblem('away_trip', undefined, undefined)).toBeNull()
    expect(policyShapeProblem('club', 'g1', null)).toBe('scope_field_unexpected')
    expect(policyShapeProblem('group', 'g1', null)).toBeNull()
    expect(policyShapeProblem('group', null, null)).toBe('group_required')
    expect(policyShapeProblem('group', '', null)).toBe('group_required')
    expect(policyShapeProblem('group', 'g1', 'match')).toBe('scope_field_unexpected')
    expect(policyShapeProblem('activity_type', null, 'match')).toBeNull()
    expect(policyShapeProblem('activity_type', null, null)).toBe('activity_type_required')
    expect(policyShapeProblem('activity_type', 'g1', 'match')).toBe('scope_field_unexpected')
  })

  it('resolves group > away trip > activity type > club > built-in', () => {
    const group = policy({ scope: 'group', groupId: 'zaki', minorDeclarationMode: 'guardian_only' })
    const away = policy({ scope: 'away_trip', minorDeclarationMode: 'guardian_confirm', confirmTimeoutHours: 48 })
    const match = policy({ scope: 'activity_type', activityType: 'match', minorDeclarationMode: 'guardian_confirm' })
    const club = policy({ scope: 'club', minorDeclarationMode: 'immediate' })
    const all = [club, match, away, group]
    expect(resolvePolicy(all, { groupId: 'zaki', activityType: 'training', isAway: false })).toBe(group)
    expect(resolvePolicy(all, { groupId: 'orliki', activityType: 'match', isAway: true })).toBe(away)
    expect(resolvePolicy(all, { groupId: 'orliki', activityType: 'match', isAway: false })).toBe(match)
    expect(resolvePolicy(all, { groupId: 'orliki', activityType: 'training', isAway: false })).toBe(club)
    expect(resolvePolicy([match], { groupId: 'orliki', activityType: 'training', isAway: true })).toBe(
      BUILT_IN_CLUB_POLICY,
    )
  })
})

describe('declaring', () => {
  const onDate = '2026-11-07'

  it('treats a participant as a minor unless known to be 18 on the session date', () => {
    expect(isMinorOn('2010-11-07', onDate)).toBe(true)
    expect(isMinorOn('2008-11-07', onDate)).toBe(false)
    expect(isMinorOn('2008-11-08', onDate)).toBe(true)
    expect(isMinorOn(null, onDate)).toBe(true)
  })

  it('refuses a yes under absence_only and accepts everything under confirm', () => {
    expect(declaredAllowedForKind('absence_only', 'yes')).toBe(false)
    expect(declaredAllowedForKind('absence_only', 'no')).toBe(true)
    expect(declaredAllowedForKind('absence_only', 'unknown')).toBe(true)
    expect(declaredAllowedForKind('confirm', 'yes')).toBe(true)
    expect(declaredAllowedForKind('confirm', 'no')).toBe(true)
  })

  it('keeps declarations open until the start of a planned session', () => {
    const startAt = new Date('2026-11-07T16:00:00Z')
    expect(declarationWindow({ status: 'planned', startAt }, new Date('2026-11-07T15:59:59Z'))).toBe('open')
    expect(declarationWindow({ status: 'planned', startAt }, new Date('2026-11-07T16:00:00Z'))).toBe('closed')
    expect(declarationWindow({ status: 'cancelled', startAt }, new Date('2026-11-01T00:00:00Z'))).toBe('not_planned')
    expect(declarationWindow({ status: 'done', startAt }, new Date('2026-11-01T00:00:00Z'))).toBe('not_planned')
  })

  it('applies the policy only to a minor declaring for themself', () => {
    const now = new Date('2026-11-05T10:00:00Z')
    const confirm = policy({ minorDeclarationMode: 'guardian_confirm', confirmTimeoutHours: 36 })
    expect(declarationOutcome({ actingRole: 'guardian', isMinor: true, policy: confirm, now })).toEqual({
      kind: 'final',
    })
    expect(declarationOutcome({ actingRole: 'coach', isMinor: true, policy: confirm, now })).toEqual({ kind: 'final' })
    expect(declarationOutcome({ actingRole: 'self', isMinor: false, policy: confirm, now })).toEqual({ kind: 'final' })
    expect(
      declarationOutcome({
        actingRole: 'self',
        isMinor: true,
        policy: policy({ minorDeclarationMode: 'immediate' }),
        now,
      }),
    ).toEqual({ kind: 'final' })
    expect(declarationOutcome({ actingRole: 'self', isMinor: true, policy: confirm, now })).toEqual({
      kind: 'pending_guardian',
      pendingUntil: new Date('2026-11-06T22:00:00Z'),
      timeoutOutcome: 'declared',
    })
    // The limit never runs past the session start: 6 hours before kick-off it ends at kick-off.
    const kickOff = new Date('2026-11-05T16:00:00Z')
    expect(
      declarationOutcome({ actingRole: 'self', isMinor: true, policy: confirm, now, startsAt: kickOff }),
    ).toMatchObject({ kind: 'pending_guardian', pendingUntil: kickOff })
    expect(
      declarationOutcome({
        actingRole: 'self',
        isMinor: true,
        policy: confirm,
        now,
        startsAt: new Date('2026-11-09T16:00:00Z'),
      }),
    ).toMatchObject({ pendingUntil: new Date('2026-11-06T22:00:00Z') })
    expect(
      declarationOutcome({
        actingRole: 'self',
        isMinor: true,
        policy: policy({ minorDeclarationMode: 'guardian_only' }),
        now,
      }),
    ).toEqual({ kind: 'guardian_only' })
  })

  it('records the source and the status after the limit', () => {
    expect(declarationSource('self')).toBe('app')
    expect(declarationSource('guardian')).toBe('app')
    expect(declarationSource('coach')).toBe('staff')
    expect(declarationSource('club_admin')).toBe('staff')
    expect(timeoutStatus('declared')).toBe('final')
    expect(timeoutStatus('rejected')).toBe('rejected_by_guardian')
  })
})

describe('counting', () => {
  const rows = [
    { personId: 'a', declared: 'yes', declarationStatus: 'final' },
    { personId: 'b', declared: 'no', declarationStatus: 'final' },
    { personId: 'c', declared: 'yes', declarationStatus: 'pending_guardian' },
    { personId: 'd', declared: 'no', declarationStatus: 'rejected_by_guardian' },
    { personId: 'stranger', declared: 'yes', declarationStatus: 'final' },
  ] as const

  it('counts only final declarations', () => {
    expect(effectiveDeclared(undefined)).toBe('unknown')
    expect(effectiveDeclared(rows[0])).toBe('yes')
    expect(effectiveDeclared(rows[2])).toBe('unknown')
    expect(effectiveDeclared(rows[3])).toBe('unknown')
  })

  it('summarises per kind (AC-007)', () => {
    const members = ['a', 'b', 'c', 'd', 'e', 'e']
    expect(declarationSummary('absence_only', members, rows)).toEqual({
      kind: 'absence_only',
      expected: 4,
      absent: 1,
      confirmed: 0,
      declined: 0,
      unanswered: 0,
    })
    expect(declarationSummary('confirm', members, rows)).toEqual({
      kind: 'confirm',
      expected: 0,
      absent: 0,
      confirmed: 1,
      declined: 1,
      unanswered: 3,
    })
  })

  it('offers "Report absence" only under absence_only', () => {
    expect(declarationChoices('absence_only')).toEqual(['no'])
    expect(declarationChoices('confirm')).toEqual(['yes', 'no'])
  })
})
