// `activities:warn-unassigned-sessions` (parity spec *Events, Jobs* row, REQ-A14, Q-A19; E10-S07 #272): every 15
// minutes the planned sessions without a coach that start within two hours are warned about, once per session and
// recipient, through `activities.occurrences.warn_unassigned`. The scheduler injects the registration's `tenantId` and
// `organizationId`; the worker re-validates them and dispatches the job command with a session-less job context.
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'activities-warn-unassigned-sessions',
  id: 'activities:warn-unassigned-sessions',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'activities',
    name: 'warn-unassigned-sessions',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.occurrences.warn_unassigned', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
