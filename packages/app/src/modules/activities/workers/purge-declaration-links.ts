// `activities:purge-declaration-links` (engineering standards S9.5; `docs/compliance/retention.md` row R9; #525): once
// a day, `activities.declaration_links.purge_dead` deletes the club's declaration links that expired 30 days ago or
// earlier.
// The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches
// the job command with a session-less job context (acting role `system`).
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('activities').child({ component: 'purge-declaration-links-worker' })

export const metadata: WorkerMeta = {
  queue: 'activities-purge-declaration-links',
  id: 'activities:purge-declaration-links',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('activities:purge-declaration-links received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.declaration_links.purge_dead', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
