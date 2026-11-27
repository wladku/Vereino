// Pure rules of the nightly invariant check `payments:verify-invariants` (club spec REQ-043, AC-043, TEST-088;
// engineering standards S10.6; issue #531): what a charge's status must be given what was paid on it, whether what was
// paid stays within what is due, and whether the club's `KP` receipt and `RG` handover numbers are unique and
// consecutive per month. The check only reads; drift becomes an operations alert (S15.5) whose fields carry ids and
// counts only (S15.1). Nothing here reads the database or the clock.
import type { CalendarDate } from '@vereino/core'
import { amountDueOf, settledStatus } from './charge-ledger'
import { CHARGE_STATUSES, type ChargeStatus } from './payments-rules'

/** The alert token of a run that found drift (`docs/ops/monitoring.md` → *Log filters*). */
export const INVARIANTS_DRIFT_SIGNAL = 'vereino.ops.payments.invariants.drift'
/** The token of a clean run, for the weekly digest. */
export const INVARIANTS_VERIFIED_SIGNAL = 'vereino.ops.payments.invariants.verified'
/** The heartbeat check the job pings: `<url>` after a clean run, `<url>/fail` after drift (`docs/ops/monitoring.md`). */
export const INVARIANTS_HEARTBEAT_URL_VARIABLE = 'VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL'
/** At most this many ids of each kind go into one alert line; the counts are always complete. */
export const MAX_ALERT_IDS = 50

/** A charge with the net sum of its payments (reversing entries included, overpayments to refund excluded). */
export type ChargeLedgerTotal = {
  id: string
  status: string
  amount: number
  discountAmount: number
  paid: number
}

/**
 * `paid_out_of_range`: the net paid is negative, above the amount due, or not zero on a cancelled or forfeited
 * charge; `status`: the stored status is not the one the payments give.
 */
export type ChargeDriftKind = 'paid_out_of_range' | 'status'

export type ChargeDrift = {
  chargeId: string
  kind: ChargeDriftKind
  status: string
  /** The status the payments give; null for `paid_out_of_range`, where no status is right. */
  expectedStatus: ChargeStatus | null
}

function knownStatus(status: string): ChargeStatus | null {
  return (CHARGE_STATUSES as readonly string[]).includes(status) ? (status as ChargeStatus) : null
}

/**
 * The drift of one charge, or null when it matches its payments. A cancelled or forfeited charge keeps its status but
 * must have nothing paid on it (cancelling refuses a paid charge, payments refuse a cancelled one). Any other charge
 * takes the status `settledStatus` derives from what was paid; a charge with nothing due and nothing paid may also be
 * `paid` (a free rental is born `paid`, a fully discounted fee `open`). An unknown status is drift.
 */
export function chargeDrift(charge: ChargeLedgerTotal): ChargeDrift | null {
  const status = knownStatus(charge.status)
  const amountDue = amountDueOf(charge)
  const settled = status === 'cancelled' || status === 'forfeited'
  const outOfRange = charge.paid < 0 || (settled ? charge.paid !== 0 : charge.paid > amountDue)
  if (outOfRange) return { chargeId: charge.id, kind: 'paid_out_of_range', status: charge.status, expectedStatus: null }
  if (settled) return null
  const expected = settledStatus(status ?? 'open', amountDue, charge.paid)
  const freeAndPaid = status === 'paid' && amountDue === 0 && charge.paid === 0
  if (status === expected || freeAndPaid) return null
  return { chargeId: charge.id, kind: 'status', status: charge.status, expectedStatus: expected }
}

/** The drift of every charge of the club, in the order given. */
export function chargeDrifts(charges: readonly ChargeLedgerTotal[]): ChargeDrift[] {
  return charges.map(chargeDrift).filter((drift): drift is ChargeDrift => drift !== null)
}

export type NumberingSeries = 'KP' | 'RG'

/**
 * One issue of a number: a `KP` receipt is shared by the payments of one acceptance, so every payment row is an entry
 * and `issueKey` (the acceptance's creation instant) tells one acceptance from another; an `RG` handover is one row,
 * keyed by its id. `issuedOn` is the club day the number belongs to (a receipt's `paid_on`), or null when unknown.
 */
export type NumberedEntry = { number: string; issueKey: string; issuedOn: CalendarDate | null }

/**
 * `malformed`: not `<series>/YYYY/MM/NNN` with NNN ≥ 1; `wrong_month`: issued on a day outside the number's month;
 * `duplicate`: one number given to two issues; `gap`: numbers missing before the month's highest.
 */
export type NumberingDriftKind = 'malformed' | 'wrong_month' | 'duplicate' | 'gap'

export type NumberingDrift = {
  series: NumberingSeries
  kind: NumberingDriftKind
  /** `YYYY-MM` of the numbers, null for a malformed one. */
  month: string | null
  /** The numbers concerned (for a gap, the missing ones), at most `MAX_ALERT_IDS`. */
  numbers: string[]
  /** How many numbers are concerned, also beyond `MAX_ALERT_IDS`. */
  count: number
}

/** The month and the sequence of a number of `series` (`KP/2026/11/007` → 2026-11, 7), or null. */
export function parseDocumentNumber(
  series: NumberingSeries,
  number: string,
): { month: string; sequence: number } | null {
  const match = /^(KP|RG)\/(\d{4})\/(0[1-9]|1[0-2])\/(\d{3,})$/.exec(number)
  if (!match || match[1] !== series) return null
  const sequence = Number(match[4])
  return sequence >= 1 ? { month: `${match[2]}-${match[3]}`, sequence } : null
}

/** The number of `series` in `month` with `sequence`, as the commands issue it (three digits at least). */
export function documentNumber(series: NumberingSeries, month: string, sequence: number): string {
  return `${series}/${month.slice(0, 4)}/${month.slice(5, 7)}/${String(sequence).padStart(3, '0')}`
}

function driftOf(series: NumberingSeries, kind: NumberingDriftKind, month: string | null, numbers: string[]) {
  return { series, kind, month, numbers: numbers.slice(0, MAX_ALERT_IDS), count: numbers.length }
}

/**
 * The numbering drift of one series of the club: malformed numbers, numbers issued outside their month, numbers
 * issued twice, and gaps (each month counts from 001 up to its highest number without a hole; payment rows and
 * handovers are never deleted, so a hole is drift). Months are reported in order.
 */
export function numberingDrifts(series: NumberingSeries, entries: readonly NumberedEntry[]): NumberingDrift[] {
  const malformed = new Set<string>()
  const issues = new Map<string, { month: string; sequence: number; keys: Set<string>; wrongMonth: boolean }>()
  for (const entry of entries) {
    const parsed = parseDocumentNumber(series, entry.number)
    if (!parsed) {
      malformed.add(entry.number)
      continue
    }
    const issue = issues.get(entry.number) ?? { ...parsed, keys: new Set<string>(), wrongMonth: false }
    issue.keys.add(entry.issueKey)
    if (entry.issuedOn !== null && entry.issuedOn.slice(0, 7) !== parsed.month) issue.wrongMonth = true
    issues.set(entry.number, issue)
  }
  const drifts: NumberingDrift[] = []
  if (malformed.size > 0) drifts.push(driftOf(series, 'malformed', null, [...malformed].sort()))
  const months = [...new Set([...issues.values()].map((issue) => issue.month))].sort()
  for (const month of months) {
    const inMonth = [...issues.entries()]
      .filter(([, issue]) => issue.month === month)
      .sort(([, a], [, b]) => a.sequence - b.sequence)
    const wrongMonth = inMonth.filter(([, issue]) => issue.wrongMonth).map(([number]) => number)
    const duplicate = inMonth.filter(([, issue]) => issue.keys.size > 1).map(([number]) => number)
    const taken = new Set(inMonth.map(([, issue]) => issue.sequence))
    const highest = inMonth[inMonth.length - 1][1].sequence
    const missing: string[] = []
    for (let sequence = 1; sequence < highest; sequence += 1) {
      if (!taken.has(sequence)) missing.push(documentNumber(series, month, sequence))
    }
    if (wrongMonth.length > 0) drifts.push(driftOf(series, 'wrong_month', month, wrongMonth))
    if (duplicate.length > 0) drifts.push(driftOf(series, 'duplicate', month, duplicate))
    if (missing.length > 0) drifts.push(driftOf(series, 'gap', month, missing))
  }
  return drifts
}

/** What one run of the check read and found. */
export type InvariantsReport = {
  counts: { charges: number; receipts: number; handovers: number }
  chargeDrifts: ChargeDrift[]
  numberingDrifts: NumberingDrift[]
}

/** Builds the report of one club from what the job read. */
export function invariantsReport(input: {
  charges: readonly ChargeLedgerTotal[]
  receipts: readonly NumberedEntry[]
  handovers: readonly NumberedEntry[]
}): InvariantsReport {
  return {
    counts: {
      charges: input.charges.length,
      receipts: new Set(input.receipts.map((entry) => entry.number)).size,
      handovers: input.handovers.length,
    },
    chargeDrifts: chargeDrifts(input.charges),
    numberingDrifts: [...numberingDrifts('KP', input.receipts), ...numberingDrifts('RG', input.handovers)],
  }
}

/** True when the run found anything to alert on. */
export function hasDrift(report: InvariantsReport): boolean {
  return report.chargeDrifts.length > 0 || report.numberingDrifts.length > 0
}

/**
 * The fields of the run's log line: the counts, and for drift the drifted charge ids (with the kind and the stored
 * and expected status) and the numbering problems, capped at `MAX_ALERT_IDS` each. Ids, counts and status words only
 * (S15.1): no amount, name or payer.
 */
export function alertFields(report: InvariantsReport): Record<string, string | number> {
  const fields: Record<string, string | number> = {
    signal: hasDrift(report) ? INVARIANTS_DRIFT_SIGNAL : INVARIANTS_VERIFIED_SIGNAL,
    charges: report.counts.charges,
    receipts: report.counts.receipts,
    handovers: report.counts.handovers,
    driftedCharges: report.chargeDrifts.length,
    numberingProblems: report.numberingDrifts.length,
  }
  if (report.chargeDrifts.length > 0) {
    fields.chargeDrifts = JSON.stringify(
      report.chargeDrifts
        .slice(0, MAX_ALERT_IDS)
        .map((drift) => [drift.chargeId, drift.kind, drift.status, drift.expectedStatus]),
    )
  }
  if (report.numberingDrifts.length > 0) {
    fields.numberingDrifts = JSON.stringify(
      report.numberingDrifts.map((drift) => [drift.series, drift.kind, drift.month, drift.count, drift.numbers]),
    )
  }
  return fields
}

/** The heartbeat URL to ping after a run (`<url>/fail` after drift), or null when no check is configured. */
export function heartbeatUrl(base: string | undefined, drift: boolean): string | null {
  const target = base?.trim().replace(/\/+$/, '') ?? ''
  if (!target) return null
  return drift ? `${target}/fail` : target
}

/**
 * The problem code a claimed run reports to the club job sweep when it found drift (`ClubJobRunResult.problem`,
 * stored as the club's `last_error` of `payments:verify-invariants`; #852).
 */
export const INVARIANTS_DRIFT_PROBLEM = 'payments.invariants.drift'

/** The counts of one sweep run of the check (`ClubJobRoundOutcome` of the foundation). */
export type InvariantsSweepOutcome = { clubs: number; failing: number; unfinished: number }

/** True when any club of the sweep run drifted, failed or gave no result. */
export function sweepFailed(outcome: InvariantsSweepOutcome): boolean {
  return outcome.failing > 0
}

/** The fields of a sweep run's log line: the signal and the counts only. */
export function sweepAlertFields(outcome: InvariantsSweepOutcome): Record<string, string | number> {
  return {
    signal: sweepFailed(outcome) ? INVARIANTS_DRIFT_SIGNAL : INVARIANTS_VERIFIED_SIGNAL,
    clubs: outcome.clubs,
    failingClubs: outcome.failing,
    unfinishedClubs: outcome.unfinished,
  }
}
