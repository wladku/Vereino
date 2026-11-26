// The pilot's leading indicators next to the declaration share (club spec *Overview and Success Measures*; product
// brief Goals, D21; E27-S03, #820; owner decision 2026-11-26 on the issue: counts and shares only, no colours or
// targets, the permission and scope of E27-S01). Pure: `services/pilot-indicators.ts` reads the records, this file
// counts them. Four indicators per section and period:
//
// - Accounts: the guardians of the section's active participants on the last day of the period, and how many of them
//   have an active account (`services/pilot-indicators.ts`);
// - Attendance recorded within 24 h: the sessions of the period that have ended, not cancelled, and how many had their
//   attendance list closed at most 24 hours after the end (`closedWithinDay`);
// - Paid on time: the `fee` and `order` charges that fall due in the period (`payments/lib/paid-on-time.ts`, read
//   through the optional `payments` service; null when the module is disabled);
// - Covered before start: the sessions that lost their coach before the start, and how many had a coach again when
//   they started (`coverBeforeStart`).
import type { CalendarDate } from '@vereino/core'
import { UNSETTLED_AFTER_HOURS, type SubstitutionKind } from './substitutions'

export type IndicatorCounts = { count: number; total: number }

/** The day the accounts are counted on: the last day of the period, or today while the period has not ended. */
export function accountsDate(period: { to: CalendarDate }, today: CalendarDate): CalendarDate {
  return period.to < today ? period.to : today
}

/** A session as the attendance indicator reads it. */
export type ClosingSession = {
  status: string
  endAt: Date
  /** When the list was closed, when known (the action log of the check-off); null when not closed or unknown. */
  closedAt: Date | null
  /** The session's version: a `done` session was closed on or before it. */
  updatedAt: Date
}

const DAY_MS = UNSETTLED_AFTER_HOURS * 60 * 60 * 1000

/** The moment a list must be closed by: 24 hours after the end. */
export function closeDeadline(endAt: Date): Date {
  return new Date(endAt.getTime() + DAY_MS)
}

/**
 * Whether the closing time must be looked up in the action log: a `done` session whose version moved after the
 * deadline (a later edit, a reopen) may have been closed before or after it. A `done` session last changed by the
 * deadline was closed by then.
 */
export function needsCloseLookup(session: Omit<ClosingSession, 'closedAt'>): boolean {
  return session.status === 'done' && session.updatedAt.getTime() > closeDeadline(session.endAt).getTime()
}

/**
 * Whether a session counts, and whether its list was closed in time: a cancelled session or one that has not ended
 * never counts; a `planned` (still open) session counts as late once the deadline has passed and not at all before; a
 * `done` session is on time when it was closed by the deadline — the logged closing time, else its version.
 */
export function closedWithinDay(session: ClosingSession, now: Date): 'on_time' | 'late' | null {
  if (session.status !== 'planned' && session.status !== 'done') return null
  if (session.endAt.getTime() > now.getTime()) return null
  const deadline = closeDeadline(session.endAt).getTime()
  if (session.status === 'planned') return now.getTime() >= deadline ? 'late' : null
  const closed = session.closedAt ?? session.updatedAt
  return closed.getTime() <= deadline ? 'on_time' : 'late'
}

/** The attendance indicator over a section's sessions. */
export function countClosedWithinDay(sessions: readonly ClosingSession[], now: Date): IndicatorCounts {
  let count = 0
  let total = 0
  for (const session of sessions) {
    const verdict = closedWithinDay(session, now)
    if (!verdict) continue
    total += 1
    if (verdict === 'on_time') count += 1
  }
  return { count, total }
}

/** The first closing of a list among its check-off log entries (the entry whose context says `completed`). */
export function firstClosing(entries: readonly { createdAt: Date; context: unknown }[]): Date | null {
  let first: Date | null = null
  for (const entry of entries) {
    const context = entry.context
    if (!context || typeof context !== 'object' || (context as { completed?: unknown }).completed !== true) continue
    if (!first || entry.createdAt.getTime() < first.getTime()) first = entry.createdAt
  }
  return first
}

/** A session with its substitution entries, as the cover indicator reads it. */
export type CoverSession = {
  status: string
  startAt: Date
  entries: readonly { kind: SubstitutionKind; createdAt: Date }[]
}

/**
 * Whether a session lost its coach before the start (`absence_reported` before `start_at`) and, if so, whether it
 * had a coach again when it started: the last entry before the start is a substitute or the coach's return. A
 * cancelled session or one that has not started yet does not count (null).
 */
export function coveredBeforeStart(session: CoverSession, now: Date): boolean | null {
  if (session.status === 'cancelled') return null
  const start = session.startAt.getTime()
  if (start > now.getTime()) return null
  const before = session.entries
    .filter((entry) => entry.createdAt.getTime() < start)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  if (!before.some((entry) => entry.kind === 'absence_reported')) return null
  return before[before.length - 1].kind !== 'absence_reported'
}

/** The cover indicator over a section's sessions; total 0 reads "None needed". */
export function countCoveredBeforeStart(sessions: readonly CoverSession[], now: Date): IndicatorCounts {
  let count = 0
  let total = 0
  for (const session of sessions) {
    const verdict = coveredBeforeStart(session, now)
    if (verdict === null) continue
    total += 1
    if (verdict) count += 1
  }
  return { count, total }
}

/** The accounts indicator: the distinct guardians and how many of them have an active account. */
export function countAccounts(guardianIds: Iterable<string>, active: ReadonlySet<string>): IndicatorCounts {
  const unique = new Set(guardianIds)
  let count = 0
  for (const id of unique) if (active.has(id)) count += 1
  return { count, total: unique.size }
}

/** The share as a whole percent (half up), or null when there is nothing to divide by. */
export function indicatorPercent(counts: IndicatorCounts): number | null {
  if (counts.total === 0) return null
  return Math.round((counts.count * 100) / counts.total)
}

/** Whether the report shows the "Paid on time" column: only when `payments` answered (never as 0 without it). */
export function showsPaidOnTime(report: { paymentsEnabled?: boolean | null } | null | undefined): boolean {
  return report?.paymentsEnabled === true
}
