import { describe, expect, it } from '@jest/globals'
import {
  TRIAL_MARK_KINDS,
  TRIAL_MARK_OPENS_MINUTES,
  TRIAL_OUTCOMES,
  TRIAL_SESSIONS_LIMIT,
  canProposeTrial,
  canWithdrawTrial,
  sessionTarget,
  trialRole,
  trialMarkable,
  trialOver,
  trialSessionIssue,
  type TrialSessionFact,
} from '../trials'

const now = new Date('2026-11-27T12:00:00Z')

const session = (overrides: Partial<TrialSessionFact> = {}): TrialSessionFact => ({
  groupId: 'g-1',
  status: 'planned',
  startAt: '2026-11-28T16:00:00Z',
  endAt: '2026-11-28T17:00:00Z',
  ...overrides,
})

describe('trial session rules (sign-up form spec DD-J12, Q-J07; #801)', () => {
  it('names the limits', () => {
    expect(TRIAL_SESSIONS_LIMIT).toBe(10)
    expect(TRIAL_MARK_OPENS_MINUTES).toBe(30)
    expect(TRIAL_OUTCOMES).toEqual(['present', 'absent'])
  })

  it('counts a session as over once it ended, was cancelled or is gone', () => {
    expect(trialOver(session(), now)).toBe(false)
    expect(trialOver(session({ endAt: '2026-11-27T12:00:00Z' }), now)).toBe(true)
    expect(trialOver(session({ status: 'cancelled' }), now)).toBe(true)
    expect(trialOver(null, now)).toBe(true)
    expect(trialOver(undefined, now)).toBe(true)
  })

  it('accepts only a planned future session of the same group', () => {
    expect(trialSessionIssue(session(), 'g-1', now)).toBeNull()
    expect(trialSessionIssue(session(), 'g-2', now)).toBe('trial_session_invalid')
    expect(trialSessionIssue(session({ status: 'done' }), 'g-1', now)).toBe('trial_session_invalid')
    expect(trialSessionIssue(session({ startAt: '2026-11-27T12:00:00Z' }), 'g-1', now)).toBe('trial_session_invalid')
    expect(trialSessionIssue(null, 'g-1', now)).toBe('trial_session_invalid')
  })

  it('proposes one trial at a time (Q-J07)', () => {
    expect(canProposeTrial('new', null, now)).toBe(true)
    expect(canProposeTrial('waiting', null, now)).toBe(true)
    expect(canProposeTrial('trial', session(), now)).toBe(false)
    expect(canProposeTrial('trial', session({ status: 'cancelled' }), now)).toBe(true)
    expect(canProposeTrial('trial', session({ endAt: '2026-11-27T11:00:00Z' }), now)).toBe(true)
    expect(canProposeTrial('accepted', null, now)).toBe(false)
  })

  it('withdraws a trial only before its session starts', () => {
    expect(canWithdrawTrial('trial', session(), now)).toBe(true)
    expect(canWithdrawTrial('new', session(), now)).toBe(false)
    expect(canWithdrawTrial('trial', null, now)).toBe(false)
    expect(canWithdrawTrial('trial', session({ status: 'cancelled' }), now)).toBe(false)
    expect(canWithdrawTrial('trial', session({ startAt: '2026-11-27T11:59:00Z' }), now)).toBe(false)
  })

  it('opens the marks with the attendance list and closes them on a cancelled session', () => {
    expect(trialMarkable(session(), now)).toBe(false)
    expect(trialMarkable(session({ startAt: '2026-11-27T12:30:00Z' }), now)).toBe(true)
    expect(trialMarkable(session({ startAt: '2026-11-27T11:00:00Z', status: 'done' }), now)).toBe(true)
    expect(trialMarkable(session({ startAt: '2026-11-27T11:00:00Z', status: 'cancelled' }), now)).toBe(false)
    expect(trialMarkable(null, now)).toBe(false)
  })

  it('describes a session for the coach check and records the assigned coach as a coach', () => {
    expect(TRIAL_MARK_KINDS).toEqual(['coach', 'self', 'club_admin'])
    expect(
      sessionTarget(
        { id: 'o-1', sectionId: 's-1', groupId: 'g-1', coachPersonId: 'p-1' },
        { tenantId: 't', organizationId: 'o' },
        'a-1',
      ),
    ).toEqual({
      id: 'a-1',
      tenantId: 't',
      organizationId: 'o',
      sectionId: 's-1',
      groupId: 'g-1',
      occurrenceId: 'o-1',
      personId: 'p-1',
    })
    expect(trialRole('self')).toBe('coach')
    expect(trialRole('club_admin')).toBe('club_admin')
  })
})
