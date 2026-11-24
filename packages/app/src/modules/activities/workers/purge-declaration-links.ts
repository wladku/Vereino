// `activities:purge-declaration-links` (engineering standards S9.5; `docs/compliance/retention.md` row R9; #525): once
// a day, `activities.declaration_links.purge_dead` deletes the club's declaration links that expired 30 days ago or
// earlier.
// The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches
// the job command with a session-less job context (acting role `system`).
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'activities-purge-declaration-links',
  id: 'activities:purge-declaration-links',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'activities',
    name: 'purge-declaration-links',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.declaration_links.purge_dead', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
