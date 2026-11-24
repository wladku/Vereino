// `facilities:expire-requests` (facilities spec *Events, Jobs* row, DD-46; #125): every 15 minutes the confirmed
// requests whose 48-hour hold ended become `expired` and the requests never confirmed within their hour are deleted,
// through `facilities.rentals.expire_requests` (`advanceWhere` and a conditional DELETE, so a retry changes nothing
// twice). The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context.
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'facilities-expire-requests',
  id: 'facilities:expire-requests',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'facilities',
    name: 'expire-requests',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('facilities.rentals.expire_requests', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
