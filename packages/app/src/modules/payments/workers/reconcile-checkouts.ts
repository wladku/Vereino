// `payments:reconcile-checkouts` (payments spec *Events* row, DD-42; payments parity spec DD-C08; #301): every 15
// minutes, `payments.checkouts.reconcile` books the late captures and expires the stale checkouts — the sweep the
// operator command `payments reconcile-checkouts` runs by hand. The scheduler injects the registration's `tenantId`
// and `organizationId`; the worker re-validates them and dispatches the job command with a session-less job context.
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'payments-reconcile-checkouts',
  id: 'payments:reconcile-checkouts',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.checkouts.reconcile', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('payments:reconcile-checkouts', handle)
