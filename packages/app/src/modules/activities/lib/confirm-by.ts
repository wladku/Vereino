// The declaration deadline of a session ("confirm by", groups and activities parity spec REQ-A07, DD-A01, DD-A02;
// D-031 §5; #269). It mirrors the gathering time of DD-43 (`gathering.ts`): the activity holds the default offset in
// minutes before the start, each session its own copy (copied by the planner, kept when the session moves); the
// instant shown is the start minus the offset. It has effect only for a `confirm` declaration kind. Pure (S3.5).
import type { DeclarationKind } from './policy'

/** The earliest deadline: 14 days before the start. */
export const MAX_CONFIRM_BY_MINUTES = 20_160

const MINUTE_MS = 60_000

/** The deadline instant of a session starting at `startAt`, or null when it has none. */
export function confirmByAt(startAt: Date, minutesBefore: number | null | undefined): Date | null {
  if (minutesBefore === null || minutesBefore === undefined || minutesBefore <= 0) return null
  return new Date(startAt.getTime() - minutesBefore * MINUTE_MS)
}

/** `confirmByAt(...)` as an ISO string, or null. */
export function confirmByIso(startAt: Date, minutesBefore: number | null | undefined): string | null {
  return confirmByAt(startAt, minutesBefore)?.toISOString() ?? null
}

/**
 * Whether the deadline has passed (DD-A02): the session has a deadline, `now` is at or after it and the session has
 * not started yet. After the start the declarations are closed for everybody anyway (409 `declarations_closed`).
 */
export function deadlinePassed(startAt: Date, minutesBefore: number | null | undefined, now: Date): boolean {
  const deadline = confirmByAt(startAt, minutesBefore)
  if (!deadline) return false
  return now.getTime() >= deadline.getTime() && now.getTime() < startAt.getTime()
}

/** The deadline as members see it: only a `confirm` session carries one; any other kind reads as "no deadline". */
export function effectiveConfirmByMinutes(
  kind: DeclarationKind,
  minutesBefore: number | null | undefined,
): number | null {
  if (kind !== 'confirm') return null
  return minutesBefore && minutesBefore > 0 ? minutesBefore : null
}

/** Whether the deadline instant has been reached, the start included (the attendance list then shows "no answer" first). */
export function deadlineReached(startAt: Date, minutesBefore: number | null | undefined, now: Date): boolean {
  const deadline = confirmByAt(startAt, minutesBefore)
  return deadline !== null && now.getTime() >= deadline.getTime()
}

/** The order of a row on the attendance list: "no answer" first once the deadline is reached (M-05), else unchanged. */
export function listRank(expectation: string, unansweredFirst: boolean): number {
  return unansweredFirst && expectation === 'unanswered' ? 0 : 1
}

export type ConfirmByError =
  'occurrence_confirm_by_after_start' | 'occurrence_confirm_by_too_early' | 'occurrence_confirm_by_in_past'

export type ConfirmByOffset = { ok: true; minutes: number } | { ok: false; code: ConfirmByError }

/**
 * The offset a submitted deadline instant stores for a session starting at `startAt`, in whole minutes: a deadline
 * less than a minute before the start (or after it), one more than 14 days before it, and one earlier than `now` are
 * refused.
 */
export function confirmByOffset(startAt: Date, confirmBy: Date, now: Date): ConfirmByOffset {
  const minutes = Math.floor((startAt.getTime() - confirmBy.getTime()) / MINUTE_MS)
  if (minutes < 1) return { ok: false, code: 'occurrence_confirm_by_after_start' }
  if (minutes > MAX_CONFIRM_BY_MINUTES) return { ok: false, code: 'occurrence_confirm_by_too_early' }
  if (confirmBy.getTime() < now.getTime()) return { ok: false, code: 'occurrence_confirm_by_in_past' }
  return { ok: true, minutes }
}

export type ConfirmByChange = {
  /** The session's start after the change. */
  startAt: Date
  /** Whether the start moves with this change. */
  moved: boolean
  /** The stored offset before the change. */
  current: number | null
  /** The submitted instant: undefined keeps the offset, null removes the deadline. */
  submitted: string | null | undefined
  /** Whether the deadline has effect on this session (a `confirm` kind). */
  applies: boolean
  now: Date
}

/**
 * The offset a session edit stores (DD-A01): a submitted instant sets it from the new start, null removes it, and an
 * omitted one keeps it — except that a move whose kept offset puts a deadline that has effect in the past must send
 * `confirmBy` explicitly (422 `occurrence_confirm_by_in_past`).
 */
export function nextConfirmByMinutes(change: ConfirmByChange): ConfirmByOffset | { ok: true; minutes: null } {
  if (change.submitted === null) return { ok: true, minutes: null }
  if (change.submitted !== undefined) return confirmByOffset(change.startAt, new Date(change.submitted), change.now)
  const kept = change.current && change.current > 0 ? change.current : null
  if (kept === null) return { ok: true, minutes: null }
  const deadline = confirmByAt(change.startAt, kept) as Date
  if (change.moved && change.applies && deadline.getTime() < change.now.getTime()) {
    return { ok: false, code: 'occurrence_confirm_by_in_past' }
  }
  return { ok: true, minutes: kept }
}

/**
 * Whether a member's declaration is refused by the deadline (DD-A02): a `self` or `guardian` declaration on a
 * `confirm` session whose deadline has passed. Staff (`activities.coach`, `activities.manage`) may still record one.
 */
export function deadlineRefuses(input: {
  kind: DeclarationKind
  actingRole: string
  startAt: Date
  minutesBefore: number | null | undefined
  now: Date
}): boolean {
  if (input.actingRole !== 'self' && input.actingRole !== 'guardian') return false
  return deadlinePassed(input.startAt, effectiveConfirmByMinutes(input.kind, input.minutesBefore), input.now)
}

/**
 * Whether tonight's declaration reminder covers a session (REQ-A07): it goes on the evening before the deadline's day
 * for a session with a deadline, otherwise on the evening before the session's day, and never once the deadline has
 * passed. `deadlineDate` is the deadline's club-zone date; `tomorrow` is the club-zone day after today.
 */
export function reminderDue(input: {
  occurrenceDate: string
  deadline: Date | null
  deadlineDate: string | null
  tomorrow: string
  now: Date
}): boolean {
  if (!input.deadline) return input.occurrenceDate === input.tomorrow
  if (input.deadline.getTime() <= input.now.getTime()) return false
  return input.deadlineDate === input.tomorrow
}
