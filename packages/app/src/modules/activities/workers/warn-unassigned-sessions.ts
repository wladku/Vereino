// `activities:warn-unassigned-sessions` (parity spec *Events, Jobs* row, REQ-A14, Q-A19; E10-S07 #272): every 15
// minutes the planned sessions without a coach that start within two hours are warned about, once per session and
// recipient, through `activities.occurrences.warn_unassigned`. The scheduler injects the registration's `tenantId` and
// `organizationId`; the worker re-validates them and dispatches the job command with a session-less job context.
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('activities').child({ component: 'warn-unassigned-sessions-worker' })

export const metadata: WorkerMeta = {
  queue: 'activities-warn-unassigned-sessions',
  id: 'activities:warn-unassigned-sessions',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('activities:warn-unassigned-sessions received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.occurrences.warn_unassigned', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
