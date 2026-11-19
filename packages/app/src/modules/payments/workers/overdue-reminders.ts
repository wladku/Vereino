// `payments:overdue-reminders` (payments parity spec *Events, Jobs* row, DD-C09; #301): daily at 09:00 club time,
// `payments.charges.remind_overdue` reminds each payer of their overdue charges — the day after the due date, then
// every 7 days, at most 4 times a charge — in one e-mail and one in-app notice per payer. The scheduler injects the
// registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches the job command with a
// session-less job context. It holds no logic.
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('payments').child({ component: 'overdue-reminders-worker' })

export const metadata: WorkerMeta = {
  queue: 'payments-overdue-reminders',
  id: 'payments:overdue-reminders',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('payments:overdue-reminders received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.charges.remind_overdue', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
