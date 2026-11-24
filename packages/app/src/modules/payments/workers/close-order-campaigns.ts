// `payments:close-order-campaigns` (payments spec *Events* row; payments parity spec DD-C08; #301): every 15 minutes,
// `payments.order_campaigns.close_due` closes the club's open order campaigns past their orders deadline — what the
// mockup promises ("After {date} the system closes the orders automatically") and what the operator command
// `payments close-order-campaigns` does by hand. The scheduler injects the registration's `tenantId` and
// `organizationId`; the worker re-validates them and dispatches the job command with a session-less job context.
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'payments-close-order-campaigns',
  id: 'payments:close-order-campaigns',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'payments',
    name: 'close-order-campaigns',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.order_campaigns.close_due', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
