// `activities:generate-occurrences` (club spec DD-10 and *Events, Jobs* row; foundation II DD-G07): the daily
// extension of every series to the 16-week horizon, registered per organization with `registerModuleSchedule` from
// `setup.ts`. The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them
// and dispatches the job command with a session-less job context (acting role `system`).
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'activities-generate-occurrences',
  id: 'activities:generate-occurrences',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'activities',
    name: 'generate-occurrences',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.occurrences.generate', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
