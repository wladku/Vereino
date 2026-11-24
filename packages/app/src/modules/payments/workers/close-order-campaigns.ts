// `payments:close-order-campaigns` (payments spec *Events* row; payments parity spec DD-C08; #301): every 15 minutes,
// `payments.order_campaigns.close_due` closes the club's open order campaigns past their orders deadline — what the
// mockup promises ("After {date} the system closes the orders automatically") and what the operator command
// `payments close-order-campaigns` does by hand. The scheduler injects the registration's `tenantId` and
// `organizationId`; the worker re-validates them and dispatches the job command with a session-less job context.
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { clubJobWorker, jobCommandContext } from '@/modules/foundation'

const logger = createLogger('payments').child({ component: 'close-order-campaigns-worker' })

export const metadata: WorkerMeta = {
  queue: 'payments-close-order-campaigns',
  id: 'payments:close-order-campaigns',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('payments:close-order-campaigns received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.order_campaigns.close_due', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629). */
export default clubJobWorker('payments:close-order-campaigns', handle)
