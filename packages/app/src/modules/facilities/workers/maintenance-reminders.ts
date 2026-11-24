// `facilities:maintenance-reminders` (facilities spec *Events, Jobs* row, DD-46; #128): daily, the reminders of the
// maintenance tasks due by date (14 days and 1 day before) or by hours of use, through
// `facilities.maintenance.send_reminders` (one dispatch per idempotency key, so a retry sends nothing twice). The
// scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches
// the job command with a session-less job context.
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'facilities-maintenance-reminders',
  id: 'facilities:maintenance-reminders',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('facilities.maintenance.send_reminders', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('facilities:maintenance-reminders', handle)
