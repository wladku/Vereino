// `activities:expire-guardian-confirmations` (club spec *Events, Jobs* row; foundation II DD-G07, P-25; #32): every
// 15 minutes the pending guardian confirmations past their time limit take the status the policy copied onto them,
// through `activities.attendance.expire` (an `advanceWhere` conditional UPDATE, so a retry changes nothing twice).
// The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context (acting role `system`).
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'activities-expire-guardian-confirmations',
  id: 'activities:expire-guardian-confirmations',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.attendance.expire', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('activities:expire-guardian-confirmations', handle)
