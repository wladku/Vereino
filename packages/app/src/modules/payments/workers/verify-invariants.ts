// `payments:verify-invariants` (club spec REQ-043, AC-043, TEST-088; engineering standards S10.6; #531): every night
// at 03:00 in the club's time zone, `payments.invariants.verify` recomputes the club's charges from their payments and
// checks its `KP` and `RG` numbering, and reports drift as an operations alert (`docs/ops/monitoring.md`); it changes
// no data. The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context (acting role `system`).
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('payments').child({ component: 'verify-invariants-worker' })

export const metadata: WorkerMeta = {
  queue: 'payments-verify-invariants',
  id: 'payments:verify-invariants',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('payments:verify-invariants received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.invariants.verify', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
