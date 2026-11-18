// `payments:reconcile-checkouts` (payments spec *Events* row, DD-42; payments parity spec DD-C08; #301): every 15
// minutes, `payments.checkouts.reconcile` books the late captures and expires the stale checkouts — the sweep the
// operator command `payments reconcile-checkouts` runs by hand. The scheduler injects the registration's `tenantId`
// and `organizationId`; the worker re-validates them and dispatches the job command with a session-less job context.
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('payments').child({ component: 'reconcile-checkouts-worker' })

export const metadata: WorkerMeta = {
  queue: 'payments-reconcile-checkouts',
  id: 'payments:reconcile-checkouts',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('payments:reconcile-checkouts received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.checkouts.reconcile', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
