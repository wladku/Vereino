// The trial session rules (sign-up form spec *Domain Vocabulary* → Trial, DD-J12, Q-J07, REQ-J16; phase 4, #801):
// a free trial, one at a time — a new one only after the previous session is over or cancelled; the session must be a
// planned session of the application's group that starts in the future; the coach marks the participant from the
// moment the attendance list opens (30 minutes before the start) until the session is cancelled. Pure: the session
// facts and the time are parameters.
import type { ActingRole, GrantKind, ScopeTarget } from '@vereino/core'
import type { ApplicationState } from './states'

/** How many of the group's next sessions the trial sheet offers (M-J3). */
export const TRIAL_SESSIONS_LIMIT = 10

/** The coach marks a trial participant from this many minutes before the start, as the attendance list (DD-A13). */
export const TRIAL_MARK_OPENS_MINUTES = 30

export const TRIAL_OUTCOMES = ['present', 'absent'] as const
export type TrialOutcome = (typeof TRIAL_OUTCOMES)[number]

/** The session facts the rules need (`activities.occurrenceFacts`). */
export type TrialSessionFact = {
  groupId: string
  status: string
  startAt: string
  endAt: string
}

function time(value: string): number {
  return Date.parse(value)
}

/**
 * Whether a proposed trial session is over: it ended, it was cancelled, or it is gone (a missing session counts as
 * over, so the application returns to the coordinator's New tab).
 */
export function trialOver(fact: TrialSessionFact | null | undefined, now: Date): boolean {
  if (!fact || fact.status === 'cancelled') return true
  return time(fact.endAt) <= now.getTime()
}

/** Why a session cannot be proposed as the trial session of an application of `groupId`; null when it can. */
export function trialSessionIssue(
  fact: TrialSessionFact | null | undefined,
  groupId: string,
  now: Date,
): 'trial_session_invalid' | null {
  if (!fact || fact.groupId !== groupId || fact.status !== 'planned') return 'trial_session_invalid'
  return time(fact.startAt) > now.getTime() ? null : 'trial_session_invalid'
}

/**
 * Q-J07: a trial is proposed for a `new` or `waiting` application, or again for a `trial` one whose session is over
 * or cancelled; never two at a time.
 */
export function canProposeTrial(
  state: ApplicationState,
  current: TrialSessionFact | null | undefined,
  now: Date,
): boolean {
  if (state === 'new' || state === 'waiting') return true
  return state === 'trial' && trialOver(current, now)
}

/** The coordinator withdraws a proposed trial while its session has not started yet. */
export function canWithdrawTrial(
  state: ApplicationState,
  current: TrialSessionFact | null | undefined,
  now: Date,
): boolean {
  if (state !== 'trial' || !current || current.status !== 'planned') return false
  return time(current.startAt) > now.getTime()
}

/** The coach marks a trial participant once the attendance list opens, unless the session was cancelled. */
export function trialMarkable(fact: TrialSessionFact | null | undefined, now: Date): boolean {
  if (!fact || fact.status === 'cancelled') return false
  return now.getTime() >= time(fact.startAt) - TRIAL_MARK_OPENS_MINUTES * 60_000
}

/** Who reads and marks trial participants: a coach of the group, the session's assigned coach (`self`), an admin. */
export const TRIAL_MARK_KINDS: readonly GrantKind[] = ['coach', 'self', 'club_admin']

/** The facts of a session a coach's scope check needs (`activities.occurrenceFacts`). */
export type TrialSessionScopeFact = {
  id: string
  sectionId: string
  groupId: string
  coachPersonId: string | null
}

/** The scope target of a session for a coach's check, as the attendance list builds it; `id` names the record. */
export function sessionTarget(
  fact: TrialSessionScopeFact,
  scope: { tenantId: string; organizationId: string },
  id: string,
): ScopeTarget {
  return {
    id,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    sectionId: fact.sectionId,
    groupId: fact.groupId,
    occurrenceId: fact.id,
    personId: fact.coachPersonId,
  }
}

/** The role recorded for a read or a mark: the assigned coach matched through `self` acts as a coach. */
export function trialRole(actingRole: ActingRole): ActingRole {
  return actingRole === 'self' ? 'coach' : actingRole
}
