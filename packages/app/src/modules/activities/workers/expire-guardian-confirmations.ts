// `activities:expire-guardian-confirmations` (club spec *Events, Jobs* row; foundation II DD-G07, P-25; #32): every
// 15 minutes the pending guardian confirmations past their time limit take the status the policy copied onto them,
// through `activities.attendance.expire` (an `advanceWhere` conditional UPDATE, so a retry changes nothing twice).
// The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context (acting role `system`).
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('activities').child({ component: 'expire-guardian-confirmations-worker' })

export const metadata: WorkerMeta = {
  queue: 'activities-expire-guardian-confirmations',
  id: 'activities:expire-guardian-confirmations',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('activities:expire-guardian-confirmations received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.attendance.expire', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
