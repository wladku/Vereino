// The share of attendance declarations made in Vereino, per section (product brief Goals — the primary metric; D21;
// E27-S01, #818; owner decision 2026-11-26 on the issue). Pure: the service reads the `done` sessions, their
// participants and their attendance rows, and this file counts them.
//
// - `confirm` kinds: the participants who answered themselves (`source` `app` or `link`, `declaration_status` `final`,
//   `declared` `yes` or `no`, `declared_at` before the start) over every participant of the session;
// - `absence_only` kinds: the actual absences (`actual` `absent`) that a member reported as absence (`declared` `no`)
//   the same way, over every actual absence;
// - the headline adds the numerators and the denominators. Staff entries (`source` `staff`) never count as "in
//   Vereino"; the personal link (REQ-017) does.
//
// The period is a range of club-zone calendar dates: the last 28 days by default, at most 366 days (12 months).
import { addDays, isCalendarDate, type CalendarDate } from '@vereino/core'
import type { ActualAttendance, DeclarationKind, DeclarationSource, DeclarationStatus, Declared } from './policy'

/** The default period: today and the 27 days before it, in the club's time zone. */
export const DECLARATION_SHARE_DEFAULT_DAYS = 28

/** The longest period: twelve months (a leap year included), both days counted. */
export const DECLARATION_SHARE_MAX_DAYS = 366

export type SharePeriod = { from: CalendarDate; to: CalendarDate }

function dayNumber(date: CalendarDate): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000
}

/** The last `DECLARATION_SHARE_DEFAULT_DAYS` days ending on `today`. */
export function defaultSharePeriod(today: CalendarDate): SharePeriod {
  return { from: addDays(today, -(DECLARATION_SHARE_DEFAULT_DAYS - 1)), to: today }
}

/**
 * The period a query asks for: none of `from` and `to` → the default period; both → that range when it is valid
 * (real dates, `to` on or after `from`, at most `DECLARATION_SHARE_MAX_DAYS` days); anything else → null.
 */
export function resolveSharePeriod(
  query: { from?: string | null; to?: string | null },
  today: CalendarDate,
): SharePeriod | null {
  const from = query.from || null
  const to = query.to || null
  if (!from && !to) return defaultSharePeriod(today)
  if (!isCalendarDate(from) || !isCalendarDate(to)) return null
  const days = dayNumber(to) - dayNumber(from) + 1
  if (days < 1 || days > DECLARATION_SHARE_MAX_DAYS) return null
  return { from, to }
}

/** The attendance row fields the count reads. */
export type ShareAttendance = {
  personId: string
  declared: Declared
  declaredAt: Date | null
  declarationStatus: DeclarationStatus
  actual: ActualAttendance | null
  source: DeclarationSource
}

/** One `done` session: its section, its kind, its start, its roster participants and its live attendance rows. */
export type ShareSession = {
  sectionId: string
  kind: DeclarationKind
  startAt: Date
  /** The group's participants on the session date (only `confirm` sessions need them). */
  participantIds: readonly string[]
  rows: readonly ShareAttendance[]
}

/** Whether a member made the declaration in Vereino: in the app or by a personal link, final, before the start. */
export function declaredInVereino(row: ShareAttendance, startAt: Date): boolean {
  if (row.source === 'staff' || row.declarationStatus !== 'final') return false
  if (!row.declaredAt) return false
  return row.declaredAt.getTime() < startAt.getTime()
}

export type ShareCounts = { declared: number; total: number }

export type SessionShare = { confirm: ShareCounts; absence: ShareCounts }

/** One session's contribution to its section (see the file comment for the rules per kind). */
export function countSession(session: ShareSession): SessionShare {
  if (session.kind === 'confirm') {
    const byPerson = new Map(session.rows.map((row) => [row.personId, row]))
    const participants = new Set([...session.participantIds, ...byPerson.keys()])
    let declared = 0
    for (const personId of participants) {
      const row = byPerson.get(personId)
      if (row && row.declared !== 'unknown' && declaredInVereino(row, session.startAt)) declared += 1
    }
    return { confirm: { declared, total: participants.size }, absence: { declared: 0, total: 0 } }
  }
  const absent = session.rows.filter((row) => row.actual === 'absent')
  const reported = absent.filter((row) => row.declared === 'no' && declaredInVereino(row, session.startAt))
  return { confirm: { declared: 0, total: 0 }, absence: { declared: reported.length, total: absent.length } }
}

export type SectionShare = {
  sectionId: string
  /** The `done` sessions counted; 0 reads "No completed sessions". */
  sessions: number
  confirm: ShareCounts
  absence: ShareCounts
  headline: ShareCounts
}

function add(a: ShareCounts, b: ShareCounts): ShareCounts {
  return { declared: a.declared + b.declared, total: a.total + b.total }
}

const ZERO: ShareCounts = { declared: 0, total: 0 }

/** The share of every section of `sectionIds`, in that order; sessions of other sections are ignored. */
export function sectionShares(sectionIds: readonly string[], sessions: readonly ShareSession[]): SectionShare[] {
  const bySection = new Map<string, SectionShare>(
    sectionIds.map((sectionId) => [
      sectionId,
      { sectionId, sessions: 0, confirm: ZERO, absence: ZERO, headline: ZERO },
    ]),
  )
  for (const session of sessions) {
    const share = bySection.get(session.sectionId)
    if (!share) continue
    const counted = countSession(session)
    share.sessions += 1
    share.confirm = add(share.confirm, counted.confirm)
    share.absence = add(share.absence, counted.absence)
    share.headline = add(share.confirm, share.absence)
  }
  return [...bySection.values()]
}

/** The share as a whole percent (half up), or null when there is nothing to divide by. */
export function sharePercent(counts: ShareCounts): number | null {
  if (counts.total === 0) return null
  return Math.round((counts.declared * 100) / counts.total)
}
