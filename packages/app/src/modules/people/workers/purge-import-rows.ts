// `people:purge-import-rows` (club spec *Events, Jobs* row, REQ-036; #28): the daily purge of the staged rows and the
// file of every import committed or cancelled 30 days ago, registered per organization with `registerModuleSchedule`
// from `setup.ts`. The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates
// them and dispatches the job command with a session-less job context (acting role `system`).
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'people-purge-import-rows',
  id: 'people:purge-import-rows',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'people',
    name: 'purge-import-rows',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.imports.purge', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
