// Substitutions and unsettled sessions (club spec glossary *Substitution*, REQ-008, DD-12; README B-15, M-04, flow F-03
// path A; E06-S13 #95): the kinds of a substitution entry, who a substitute stands in for, when the assigned coach may
// still report an absence, the coaches the substitute dialog offers with the session that keeps each one busy, and the
// "unsettled" predicate (a planned session 24 hours after its end, club spec *Events* row). Pure: callers pass "now".
// E10-S07 (#272, REQ-A14): when a session without a coach is warned about, and to whom.

export const SUBSTITUTION_KINDS = ['absence_reported', 'substitute_assigned', 'coach_restored'] as const

export type SubstitutionKind = (typeof SUBSTITUTION_KINDS)[number]

/** The longest reason an absence or a substitution takes (README M-04 dialog). */
export const SUBSTITUTION_REASON_MAX = 200

/** A trimmed reason, or null for a blank one. */
export function reasonOrNull(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** The slice of an entry these rules read, oldest first. */
export type SubstitutionStep = {
  previousCoachPersonId: string | null
  newCoachPersonId: string | null
}

/**
 * The coach the session had before its first substitution entry — the coach it belongs to; with no entries, the
 * current coach. Null when the session started without a coach.
 */
export function originalCoach(steps: readonly SubstitutionStep[], currentCoachPersonId: string | null): string | null {
  return steps.length > 0 ? steps[0].previousCoachPersonId : currentCoachPersonId
}

/** The kind of an assignment: giving the session back to its own coach restores it, anyone else substitutes. */
export function assignmentKind(
  steps: readonly SubstitutionStep[],
  currentCoachPersonId: string | null,
  newCoachPersonId: string,
): Exclude<SubstitutionKind, 'absence_reported'> {
  return originalCoach(steps, currentCoachPersonId) === newCoachPersonId ? 'coach_restored' : 'substitute_assigned'
}

/**
 * Whom the session's coach stands in for: the session's own coach when entries moved it to someone else, else null
 * (no entries, no coach now, or the own coach is back).
 */
export function substituteFor(steps: readonly SubstitutionStep[], currentCoachPersonId: string | null): string | null {
  if (steps.length === 0 || !currentCoachPersonId) return null
  const own = originalCoach(steps, currentCoachPersonId)
  return own && own !== currentCoachPersonId ? own : null
}

export type AbsenceProblem = 'not_planned' | 'started'

/** The assigned coach reports an absence for a planned session that has not started yet. */
export function absenceProblem(occurrence: { status: string; startAt: Date }, now: Date): AbsenceProblem | null {
  if (occurrence.status !== 'planned') return 'not_planned'
  return occurrence.startAt.getTime() <= now.getTime() ? 'started' : null
}

/**
 * "Report absence" shows for the session's assigned coach while the absence is still possible (README M-04, M-05).
 * The route keeps the rule; this only mirrors it.
 */
export function canReportAbsence(
  occurrence: { status: string; coachPersonId: string | null; startAt: string },
  selfPersonId: string | null,
  now: Date,
): boolean {
  if (!selfPersonId || occurrence.coachPersonId !== selfPersonId) return false
  const startAt = new Date(occurrence.startAt)
  return !Number.isNaN(startAt.getTime()) && absenceProblem({ status: occurrence.status, startAt }, now) === null
}

/** How long after its end a planned session counts as unsettled. */
export const UNSETTLED_AFTER_HOURS = 24

/** Sessions that ended before this instant and are still planned are unsettled. */
export function unsettledCutoff(now: Date): Date {
  return new Date(now.getTime() - UNSETTLED_AFTER_HOURS * 60 * 60 * 1000)
}

/** A planned session that ended 24 hours ago or more without a closed attendance list. */
export function isUnsettled(occurrence: { status: string | null; endAt: string | null }, now: Date): boolean {
  if (occurrence.status !== 'planned' || !occurrence.endAt) return false
  const end = Date.parse(occurrence.endAt)
  return !Number.isNaN(end) && end <= unsettledCutoff(now).getTime()
}

/** The unsettled sessions among calendar entries, oldest first (the coach's Today alert, README M-02). */
export function unsettledEntries<
  T extends { occurrence: { status: string | null; endAt: string | null; startAt: string } },
>(entries: readonly T[], now: Date): T[] {
  return entries
    .filter((entry) => isUnsettled(entry.occurrence, now))
    .sort((a, b) => a.occurrence.startAt.localeCompare(b.occurrence.startAt))
}

export type CoachCandidateName = { id: string; name: string }

/** A session of a candidate coach that overlaps the session to staff. */
export type BusySession = { id: string; coachPersonId: string; activityName: string | null; startAt: Date }

export type SubstituteOption = {
  id: string
  name: string
  /** The session that keeps the coach busy at that time, or null when free. */
  busy: { occurrenceId: string; activityName: string | null; startAt: string } | null
}

/**
 * The coaches the substitute dialog offers, in the given (name) order, without the session's current coach; a coach
 * with an overlapping session carries the earliest one, so the dialog disables them with "Busy: {session}".
 */
export function substituteOptions(
  candidates: readonly CoachCandidateName[],
  busySessions: readonly BusySession[],
  currentCoachPersonId: string | null,
): SubstituteOption[] {
  const earliest = new Map<string, BusySession>()
  for (const session of busySessions) {
    const known = earliest.get(session.coachPersonId)
    if (!known || session.startAt.getTime() < known.startAt.getTime()) earliest.set(session.coachPersonId, session)
  }
  return candidates
    .filter((candidate) => candidate.id !== currentCoachPersonId)
    .map((candidate) => {
      const session = earliest.get(candidate.id)
      return {
        id: candidate.id,
        name: candidate.name,
        busy: session
          ? { occurrenceId: session.id, activityName: session.activityName, startAt: session.startAt.toISOString() }
          : null,
      }
    })
}

export type TakeOverProblem = 'not_planned' | 'ended' | 'has_coach'

/**
 * Why a session cannot be taken over (REQ-A14), or null: it is not planned (409 `occurrence_not_planned`), it has
 * already ended (409 `occurrence_already_ended`: a past session is not claimed afterwards for the units report), or
 * someone leads it (409 `occurrence_has_coach`). A running session may still be taken.
 */
export function takeOverProblem(
  occurrence: { status: string; coachPersonId?: string | null; endAt: Date },
  now: Date,
): TakeOverProblem | null {
  if (occurrence.status !== 'planned') return 'not_planned'
  if (occurrence.endAt.getTime() <= now.getTime()) return 'ended'
  return occurrence.coachPersonId ? 'has_coach' : null
}

/** The person leads the group on the session date: an active `coach` or `assistant` membership in its roster. */
export function leadsGroup(roster: readonly { personId: string; role: string }[], personId: string): boolean {
  return roster.some(
    (member) => member.personId === personId && (member.role === 'coach' || member.role === 'assistant'),
  )
}

/** The warning before an unstaffed session goes this many hours before its start (parity spec Q-A19, REQ-A14). */
export const UNSTAFFED_WARNING_HOURS = 2

/** The starts a warning run looks at: from now (exclusive) to two hours ahead (inclusive). */
export function unstaffedWarningWindow(now: Date): { after: Date; until: Date } {
  return { after: now, until: new Date(now.getTime() + UNSTAFFED_WARNING_HOURS * 3_600_000) }
}

/** A planned session without a coach that starts within the next two hours is warned about (once, by the job). */
export function unstaffedWarningDue(
  occurrence: { status: string; coachPersonId?: string | null; startAt: Date },
  now: Date,
): boolean {
  if (occurrence.status !== 'planned' || occurrence.coachPersonId) return false
  const { after, until } = unstaffedWarningWindow(now)
  const start = occurrence.startAt.getTime()
  return start > after.getTime() && start <= until.getTime()
}

/**
 * Who is warned: the section's coordinators and the group's coaches and assistants on the session date, each once,
 * sorted (the job's audience, REQ-A14).
 */
export function unstaffedWarningRecipients(
  coordinatorIds: readonly string[],
  roster: readonly { personId: string; role: string }[],
): string[] {
  const leaders = roster.filter((member) => member.role === 'coach' || member.role === 'assistant')
  return [...new Set([...coordinatorIds, ...leaders.map((member) => member.personId)])].sort()
}
