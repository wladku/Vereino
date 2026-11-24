// `payments:generate-charges` (payments parity spec *Events, Jobs* row, DD-C08; #301): daily at 06:00 club time,
// `payments.charges.generate_due` generates the current month's charges once the club's generation day has come —
// never the month in which migration B was applied, never a month that already has a generation (an undone one
// counts). The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context. It holds no logic.
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'payments-generate-charges',
  id: 'payments:generate-charges',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'payments',
    name: 'generate-charges',
  })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.charges.generate_due', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
