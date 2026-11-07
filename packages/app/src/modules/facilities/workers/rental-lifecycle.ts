// `facilities:rental-lifecycle` (facilities spec *Events, Jobs* row, DD-46; #122): every 15 minutes the confirmed
// rentals whose end has passed become `done`, through `facilities.rentals.advance_lifecycle` (an `advanceWhere`
// conditional UPDATE, so a retry changes nothing twice). The scheduler injects the registration's `tenantId` and
// `organizationId`; the worker re-validates them and dispatches the job command with a session-less job context. The
// "to clarify" list of unpaid rentals past their payment deadline waits for the management agreement (Q04).
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('facilities').child({ component: 'rental-lifecycle-worker' })

export const metadata: WorkerMeta = {
  queue: 'facilities-rental-lifecycle',
  id: 'facilities:rental-lifecycle',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('facilities:rental-lifecycle received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('facilities.rentals.advance_lifecycle', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
