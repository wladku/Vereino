// `payments:verify-invariants` (club spec REQ-043, AC-043, TEST-088; engineering standards S10.6; #531): every night
// at 03:00 in the club's time zone, `payments.invariants.verify` recomputes the club's charges from their payments and
// checks its `KP` and `RG` numbering, and reports drift as an operations alert (`docs/ops/monitoring.md`); it changes
// no data. The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context (acting role `system`).
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  clubJobWorker,
  jobCommandContext,
  parseClubJobClaim,
  type ClubJobRunResult,
  type TrustedScope,
} from '@/modules/foundation'
import { INVARIANTS_DRIFT_PROBLEM } from '../lib/invariants'
import type { VerifyInvariantsResult } from '../commands/invariants'

export const metadata: WorkerMeta = {
  queue: 'payments-verify-invariants',
  id: 'payments:verify-invariants',
  concurrency: 1,
}

/**
 * A claimed run of the sweep (#852) pings nothing and reports drift as its problem code, so the club's job state
 * counts it and the sweep run's round pings once for all its clubs; a run of a per-club schedule pings as before.
 */
async function handle(scope: TrustedScope, job: QueuedJob<Record<string, unknown>>): Promise<ClubJobRunResult> {
  const sweepRun = parseClubJobClaim(job.payload) !== null
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  const { result } = await commandBus.execute<Record<string, unknown>, VerifyInvariantsResult>(
    'payments.invariants.verify',
    { input: sweepRun ? { sweepRun: true } : {}, ctx: jobCommandContext(container, scope) },
  )
  return result.drift ? { problem: INVARIANTS_DRIFT_PROBLEM } : {}
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('payments:verify-invariants', handle)
