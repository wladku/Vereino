// `facilities:maintenance-reminders` (facilities spec *Events, Jobs* row, DD-46; #128): daily, the reminders of the
// maintenance tasks due by date (14 days and 1 day before) or by hours of use, through
// `facilities.maintenance.send_reminders` (one dispatch per idempotency key, so a retry sends nothing twice). The
// scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches
// the job command with a session-less job context.
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('facilities').child({ component: 'maintenance-reminders-worker' })

export const metadata: WorkerMeta = {
  queue: 'facilities-maintenance-reminders',
  id: 'facilities:maintenance-reminders',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('facilities:maintenance-reminders received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('facilities.maintenance.send_reminders', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
