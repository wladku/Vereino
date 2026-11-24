// `payments:generate-charges` (payments parity spec *Events, Jobs* row, DD-C08; #301): daily at 06:00 club time,
// `payments.charges.generate_due` generates the current month's charges once the club's generation day has come —
// never the month in which migration B was applied, never a month that already has a generation (an undone one
// counts). The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context. It holds no logic.
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { clubJobWorker, jobCommandContext } from '@/modules/foundation'

const logger = createLogger('payments').child({ component: 'generate-charges-worker' })

export const metadata: WorkerMeta = {
  queue: 'payments-generate-charges',
  id: 'payments:generate-charges',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('payments:generate-charges received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.charges.generate_due', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629). */
export default clubJobWorker('payments:generate-charges', handle)
