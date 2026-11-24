// `payments:reconcile-checkouts` (payments spec *Events* row, DD-42; payments parity spec DD-C08; #301): every 15
// minutes, `payments.checkouts.reconcile` books the late captures and expires the stale checkouts — the sweep the
// operator command `payments reconcile-checkouts` runs by hand. The scheduler injects the registration's `tenantId`
// and `organizationId`; the worker re-validates them and dispatches the job command with a session-less job context.
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'payments-reconcile-checkouts',
  id: 'payments:reconcile-checkouts',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'payments',
    name: 'reconcile-checkouts',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.checkouts.reconcile', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
