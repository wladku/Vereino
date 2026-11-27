// The nightly invariant check of `payments` (club spec REQ-043, AC-043, TEST-088; engineering standards S10.6;
// #531): reads every charge with the net sum of its payments and every `KP` and `RG` number of one club, judges them
// with the pure rules of `lib/invariants.ts`, and reports the outcome as an operations signal (S15.5,
// `docs/ops/monitoring.md`): drift is an `error` log line with the alert token `vereino.ops.payments.invariants.drift`
// and a `/fail` ping of the heartbeat check `VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL`; a clean run logs at
// `info` and pings the check, so a check that never runs alerts too. It writes nothing.
// On the club job sweep (#852) a club's run pings nothing: the sweep run's round reports once, after all the clubs it
// enqueued, with the count of failing clubs (`reportInvariantsSweep`), so a later clean club no longer clears the
// alert of an earlier one. A run without the sweep (a per-club schedule of the old setup, `payments run-job`) still
// pings per club.
import type { EntityManager } from '@mikro-orm/postgresql'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { chargeLedgerTotals, handoverNumbers, receiptNumberIssues } from '../data/queries'
import {
  INVARIANTS_HEARTBEAT_URL_VARIABLE,
  alertFields,
  hasDrift,
  heartbeatUrl,
  invariantsReport,
  sweepAlertFields,
  sweepFailed,
  type InvariantsReport,
  type InvariantsSweepOutcome,
} from '../lib/invariants'
import type { PaymentsScope } from './directory'

const logger = createLogger('payments').child({ component: 'verify-invariants' })

const HEARTBEAT_TIMEOUT_MS = 5_000

/** Reads the club's ledger totals and numbers and builds the report; read-only. */
export async function readPaymentsInvariants(em: EntityManager, scope: PaymentsScope): Promise<InvariantsReport> {
  const charges = await chargeLedgerTotals(em, scope)
  const receipts = await receiptNumberIssues(em, scope)
  const handovers = await handoverNumbers(em, scope)
  return invariantsReport({
    charges,
    receipts,
    handovers: handovers.map((row) => ({ number: row.number, issueKey: row.id, issuedOn: null })),
  })
}

/**
 * `skipped`: no heartbeat check configured; `sent`: the monitor accepted the ping; `failed`: refused or unreachable;
 * `sweep`: a run of the club job sweep, whose round pings once for all its clubs.
 */
export type InvariantsHeartbeat = 'skipped' | 'sent' | 'failed' | 'sweep'

/** Pings the heartbeat check (`<url>/fail` when `failed`). A refused ping is logged and never fails the job. */
async function pingInvariantsHeartbeat(failed: boolean): Promise<InvariantsHeartbeat> {
  const url = heartbeatUrl(process.env[INVARIANTS_HEARTBEAT_URL_VARIABLE], failed)
  if (!url) return 'skipped'
  try {
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS) })
    if (response.ok) return 'sent'
  } catch {
    // Unreachable: logged below, like a refusal.
  }
  logger.warn('Payments invariants heartbeat ping failed', { variable: INVARIANTS_HEARTBEAT_URL_VARIABLE })
  return 'failed'
}

/**
 * Writes the run's log line and, unless the club job sweep reports the run (`ping: false`), pings the heartbeat
 * check. A refused ping is logged and never fails the job: the log line already carries the alert.
 */
export async function reportPaymentsInvariants(
  scope: PaymentsScope,
  report: InvariantsReport,
  options: { ping?: boolean } = {},
): Promise<InvariantsHeartbeat> {
  const drift = hasDrift(report)
  const fields = { tenantId: scope.tenantId, organizationId: scope.organizationId, ...alertFields(report) }
  if (drift) logger.error('Payments invariants drift', fields)
  else logger.info('Payments invariants verified', fields)
  if (options.ping === false) return 'sweep'
  return pingInvariantsHeartbeat(drift)
}

/**
 * The round report of one sweep run of `payments:verify-invariants` (`afterSweep`, #852): one log line with the
 * counts and one ping, `<url>/fail` when any of the run's clubs drifted, failed or gave no result. The per-club lines
 * name the clubs.
 */
export async function reportInvariantsSweep(outcome: InvariantsSweepOutcome): Promise<InvariantsHeartbeat> {
  const failed = sweepFailed(outcome)
  const fields = sweepAlertFields(outcome)
  if (failed) logger.error('Payments invariants sweep found failing clubs', fields)
  else logger.info('Payments invariants sweep verified', fields)
  return pingInvariantsHeartbeat(failed)
}
