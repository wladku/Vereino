// Pure rules of the facility log (facilities spec *Data Models* → `facilities_logs`, REQ-016; M-12 "Open facility" and
// "Close facility", B-27; #126): one log per place and day; opening needs the condition before, closing the condition
// after and an earlier opening; today's groups each name one session or one rental with a head count and whether an
// adult supervisor is present. A log is editable until the end of the day after its date, then by the club
// administrator only (403 `log_edit_closed`). Nothing here reads the database or the clock (S3.5).
import { addDays, type CalendarDate } from '@vereino/core'
import type { FacilitiesErrorCode } from './error-codes'

/** M-12: the head count of one group present (a 7-a-side tournament with spectators stays well below it). */
export const HEADCOUNT_MAX = 500

/** M-12 / B-27: the condition texts and the remarks. */
export const LOG_TEXT_MAX_LENGTH = 2000

/** One group present on the day: a session or a rental, the head count and the adult supervisor. */
export type GroupPresent = {
  readonly occurrenceId?: string | null
  readonly rentalId?: string | null
  readonly headcount: number
  readonly adultSupervisorPresent: boolean
}

/** The log fields the state rules read. */
export type LogState = {
  readonly openedAt: Date | null
  readonly closedAt: Date | null
  readonly conditionBefore: string | null
  readonly conditionAfter: string | null
}

export type LogProblem = { code: FacilitiesErrorCode; field: string }

/** A log may not be written for a day that has not begun in the club's time zone (422 `log_date_invalid`). */
export function logDateAllowed(logDate: CalendarDate, today: CalendarDate): boolean {
  return logDate <= today
}

/**
 * True when the caller may write the log of `logDate` on `today`: until the end of the next day anyone with the
 * log feature in scope, afterwards the club administrator only (spec: "editable until the end of the next day, then
 * administrator only").
 */
export function logEditable(logDate: CalendarDate, today: CalendarDate, clubAdmin: boolean): boolean {
  return clubAdmin || today <= addDays(logDate, 1)
}

const filled = (text: string | null): boolean => text !== null && text.trim().length > 0

/** The first rule the log's opening and closing break, or null. */
export function logStateProblem(state: LogState): LogProblem | null {
  if (state.openedAt && !filled(state.conditionBefore)) {
    return { code: 'log_condition_required', field: 'conditionBefore' }
  }
  if (!state.closedAt) return null
  if (!state.openedAt) return { code: 'log_not_opened', field: 'closedAt' }
  if (state.closedAt.getTime() < state.openedAt.getTime()) return { code: 'log_period_invalid', field: 'closedAt' }
  if (!filled(state.conditionAfter)) return { code: 'log_condition_required', field: 'conditionAfter' }
  return null
}

/** The key of a group present: its session or its rental; null when it names neither or both. */
export function groupKey(group: GroupPresent): string | null {
  const occurrenceId = group.occurrenceId ?? null
  const rentalId = group.rentalId ?? null
  if (occurrenceId !== null) return rentalId === null ? `occurrence:${occurrenceId}` : null
  return rentalId === null ? null : `rental:${rentalId}`
}

/** True when every group names exactly one session or rental, at most once, with a valid head count. */
export function groupsPresentValid(groups: readonly GroupPresent[]): boolean {
  const keys = new Set<string>()
  for (const group of groups) {
    const key = groupKey(group)
    if (key === null || keys.has(key)) return false
    if (!Number.isInteger(group.headcount) || group.headcount < 0 || group.headcount > HEADCOUNT_MAX) return false
    keys.add(key)
  }
  return true
}

/** The sessions and the rentals the groups name, for the reference check. */
export function groupReferences(groups: readonly GroupPresent[]): { occurrenceIds: string[]; rentalIds: string[] } {
  return {
    occurrenceIds: groups.flatMap((group) => (group.occurrenceId ? [group.occurrenceId] : [])),
    rentalIds: groups.flatMap((group) => (group.rentalId ? [group.rentalId] : [])),
  }
}
