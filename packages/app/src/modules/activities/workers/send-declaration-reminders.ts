// `activities:send-declaration-reminders` (club spec *Events, Jobs* row, REQ-017; foundation II P-12): daily at 18:00 in
// the club's time zone, the personal declaration link for tomorrow's undeclared `confirm` sessions, through
// `activities.declaration_links.send_reminders` (one link per person and session: the dispatch key makes a retry send
// nothing twice). The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates
// them and dispatches the job command with a session-less job context (acting role `system`).
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('activities').child({ component: 'send-declaration-reminders-worker' })

export const metadata: WorkerMeta = {
  queue: 'activities-send-declaration-reminders',
  id: 'activities:send-declaration-reminders',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('activities:send-declaration-reminders received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.declaration_links.send_reminders', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
