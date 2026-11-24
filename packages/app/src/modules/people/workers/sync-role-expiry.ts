// `people:sync-role-expiry` (foundation spec P-12, DD-G07; club spec *Events* row): the daily role recomputation,
// registered per organization with `registerModuleSchedule` from `setup.ts`. The scheduler injects the
// registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches the job command with
// a session-less job context (acting role `system`).
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'people-sync-role-expiry',
  id: 'people:sync-role-expiry',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, { module: 'people', name: 'sync-role-expiry' })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.sync_roles', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
