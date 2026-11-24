// `facilities:purge-rental-links` (engineering standards S9.5; `docs/compliance/retention.md` row R9; #525): once a
// day, `facilities.rental_links.purge_dead` deletes the club's rental links that expired or were used 30 days ago or
// earlier.
// The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches
// the job command with a session-less job context (acting role `system`).
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'facilities-purge-rental-links',
  id: 'facilities:purge-rental-links',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'facilities',
    name: 'purge-rental-links',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('facilities.rental_links.purge_dead', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
