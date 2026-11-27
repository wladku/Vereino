// The rules of accepting an application and of the places it takes (sign-up form spec BR-J4, BR-J6, DD-J10, DD-J10a,
// DD-J11, DD-J14, DD-J15, DD-J15a; phase 3, #800): the start day, who becomes which person, which person a decider may
// reuse (only a possible duplicate the club already found), the freed-place notice and its once-a-day key, and the
// season end. Pure and client-safe: dates are `YYYY-MM-DD` strings and today is a parameter.
import type { ApplicationKind } from './states'

/** How far ahead a start day may lie (a club recruits for the coming season, never years ahead). */
export const START_DAY_MAX_DAYS_AHEAD = 366

const DAY_MS = 24 * 60 * 60 * 1000

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * BR-J6: the start day is today or later, at most `START_DAY_MAX_DAYS_AHEAD` days ahead, and not after the end of the
 * season the application counts for (`seasonEndsOn` of the reference date, DD-J03) when the club has one.
 */
export function startDayValid(startDay: string, today: string, seasonEndsOn: string | null): boolean {
  if (startDay < today) return false
  if (startDay > addDays(today, START_DAY_MAX_DAYS_AHEAD)) return false
  return seasonEndsOn === null || startDay <= seasonEndsOn
}

/** A stored possible duplicate (DD-J11): the person and the role it may replace. */
export type CandidateRef = { personId: string; role: 'participant' | 'guardian' }

/** The person ids a decider may reuse for a role: only the possible duplicates found for that role. */
export function reusableIds(candidates: readonly CandidateRef[], role: CandidateRef['role']): Set<string> {
  return new Set(candidates.filter((entry) => entry.role === role).map((entry) => entry.personId))
}

export type PersonChoice = { personId?: string | null }

export type AcceptPlan = {
  /** The participant: an existing person to reuse, or null for a new person. */
  participant: { reuse: string | null }
  /** The guardian of a child (null for an adult applying for themself). */
  guardian: { reuse: string | null } | null
  /** Who receives the account invitation (Q-J08): the guardian of a child, or the adult. */
  invitee: 'participant' | 'guardian'
}

export type AcceptPlanIssue = 'candidate_invalid' | 'guardian_is_participant'

/**
 * DD-J10, REQ-J13: who becomes which person. A reused person must be a possible duplicate of its role; the guardian of
 * a child is never the child. An adult has no guardian, whatever was sent.
 */
export function acceptPlan(
  kind: ApplicationKind,
  choices: { child?: PersonChoice | null; guardian?: PersonChoice | null },
  candidates: readonly CandidateRef[],
): { plan: AcceptPlan } | { issue: AcceptPlanIssue; field: 'child' | 'guardian' } {
  const participantId = choices.child?.personId ?? null
  if (participantId && !reusableIds(candidates, 'participant').has(participantId)) {
    return { issue: 'candidate_invalid', field: 'child' }
  }
  if (kind === 'adult') {
    return { plan: { participant: { reuse: participantId }, guardian: null, invitee: 'participant' } }
  }
  const guardianId = choices.guardian?.personId ?? null
  if (guardianId && !reusableIds(candidates, 'guardian').has(guardianId)) {
    return { issue: 'candidate_invalid', field: 'guardian' }
  }
  if (guardianId && guardianId === participantId) return { issue: 'guardian_is_participant', field: 'guardian' }
  return { plan: { participant: { reuse: participantId }, guardian: { reuse: guardianId }, invitee: 'guardian' } }
}

/** BR-J4 with DD-J10a: accepting into a full group needs the decider's explicit "beyond the limit". */
export function needsOverLimit(group: { placesLimit: number | null; occupied: number }): boolean {
  return group.placesLimit !== null && group.occupied >= group.placesLimit
}

/** DD-J15: the groups with a waiting list where a place is free on the day (each is told once that day). */
export function freedPlaceGroups(
  targets: readonly { groupId: string; placesLimit: number | null; occupied: number; isActive: boolean }[],
  waitingGroupIds: ReadonlySet<string>,
): string[] {
  return targets
    .filter((target) => target.isActive && waitingGroupIds.has(target.groupId) && !needsOverLimit(target))
    .map((target) => target.groupId)
}

/** The once-a-day key of a freed-place notice (DD-J15): one per group and club day. */
export function freedPlaceKey(groupId: string, day: string): string {
  return `place_freed:${groupId}:${day}`
}

/** DD-J14, R24: the season of the reference date ended before today (without a season, never). */
export function seasonEnded(seasonEndsOn: string | null, today: string): boolean {
  return seasonEndsOn !== null && seasonEndsOn < today
}
