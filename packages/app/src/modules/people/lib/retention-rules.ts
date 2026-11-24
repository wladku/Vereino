// The rule of the former participants' retention sweep (club spec REQ-041, amendment B; engineering standards S9.5,
// S9.6; #471): who the daily `people:retention-sweep` anonymises. A person qualifies once they left the club, and no
// membership, role assignment, guardianship or other module's record reaches past the cutoff — `today` minus the
// club setting `former_participant_retention_months` — and no charge naming them is open (unpaid or disputed) and no
// cash is held by them: the owner's "retention hold" (#471, 2026-11-22) is an open charge, not a separate flag. Pure:
// `today` is the club's calendar date (S3.5).
import { assertCalendarDate, type CalendarDate } from '@vereino/core'
import type { ContributorNotice } from './erasure-rules'

/** The reason `people.persons.anonymize` records for an anonymisation by the sweep (REQ-041). */
export const RETENTION_SWEEP_REASON = 'retention_sweep'

/** The reason it records for an anonymisation on a recorded erasure request (REQ-L05). */
export const ERASURE_REQUEST_REASON = 'erasure_request'

export type AnonymizeReason = typeof RETENTION_SWEEP_REASON | typeof ERASURE_REQUEST_REASON

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * The calendar date `months` before `today`; a day the target month lacks becomes its last day (31 March − 1 month =
 * 28 or 29 February), so a full number of months has always passed on the returned day.
 */
export function monthsBefore(today: CalendarDate, months: number): CalendarDate {
  assertCalendarDate(today, 'today')
  const index = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 - months
  const year = Math.floor(index / 12)
  const month = index - year * 12 + 1
  const day = Math.min(Number(today.slice(8, 10)), daysInMonth(year, month))
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The end a period without an end date reaches: later than any cutoff. */
export const OPEN_END: CalendarDate = '9999-12-31'

/** The latest end among the periods (`OPEN_END` for one without an end date); null without any period. */
export function latestEnd(periods: ReadonlyArray<{ validTo?: CalendarDate | null }>): CalendarDate | null {
  let latest: CalendarDate | null = null
  for (const period of periods) {
    const end = period.validTo ?? null
    if (end === null) return OPEN_END
    if (latest === null || end > latest) latest = end
  }
  return latest
}

/** What the sweep reads for one person. */
export type RetentionFacts = {
  leftOn: CalendarDate | null
  anonymizedAt: Date | null
  hasAccount: boolean
  /** The latest end of the person's role assignments (`latestEnd`). */
  rolesUntil: CalendarDate | null
  /** The latest end of the guardianships where the person is the guardian or the ward. */
  guardianshipsUntil: CalendarDate | null
  /** Records other modules (memberships, contracts, maintainers, coached groups) hold for the person past the cutoff. */
  recordsAfterCutoff: number
  /** The `payments` notices for the person: an open charge or cash held keeps them (the retention hold). */
  contributorNotices: readonly ContributorNotice[]
}

export type RetentionKeepReason =
  | 'already_anonymized'
  | 'not_left'
  | 'left_within_period'
  | 'account_open'
  | 'role_within_period'
  | 'guardianship_within_period'
  | 'records_within_period'
  | 'open_charges'
  | 'cash_held'

const HOLDING_NOTICES = new Set<RetentionKeepReason>(['open_charges', 'cash_held'])

function reachesPast(end: CalendarDate | null, cutoff: CalendarDate): boolean {
  return end !== null && end > cutoff
}

/**
 * Why the person is kept on this run, in a stable order; empty = anonymise. `cutoff` is `monthsBefore(today, months)`:
 * a person who left on the cutoff or before qualifies, and so does a role or guardianship that ended then.
 */
export function retentionKeepReasons(facts: RetentionFacts, cutoff: CalendarDate): RetentionKeepReason[] {
  if (facts.anonymizedAt) return ['already_anonymized']
  const reasons: RetentionKeepReason[] = []
  if (!facts.leftOn) reasons.push('not_left')
  else if (facts.leftOn > cutoff) reasons.push('left_within_period')
  if (facts.hasAccount) reasons.push('account_open')
  if (reachesPast(facts.rolesUntil, cutoff)) reasons.push('role_within_period')
  if (reachesPast(facts.guardianshipsUntil, cutoff)) reasons.push('guardianship_within_period')
  if (facts.recordsAfterCutoff > 0) reasons.push('records_within_period')
  for (const code of new Set(facts.contributorNotices.map((notice) => notice.code))) {
    if (HOLDING_NOTICES.has(code as RetentionKeepReason)) reasons.push(code as RetentionKeepReason)
  }
  return reasons
}

/** The counts the sweep logs and records (never ids or names). */
export type RetentionSweepCounts = {
  /** Former persons who left on the cutoff or before and are not anonymised. */
  candidates: number
  anonymized: number
  /** Candidates kept by a reason above (a role, a guardianship, a record, an open charge…). */
  kept: number
  /** Candidates whose anonymisation failed this run; the next run retries them. */
  failed: number
}

export function emptyRetentionSweepCounts(): RetentionSweepCounts {
  return { candidates: 0, anonymized: 0, kept: 0, failed: 0 }
}
