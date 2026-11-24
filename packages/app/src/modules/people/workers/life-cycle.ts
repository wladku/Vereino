// `people:life-cycle` (people life-cycle spec *Events, Jobs* row, DD-L09; phase L8, #310): the daily life-cycle job,
// registered per organization with `registerModuleSchedule` (`services/club-setup.ts`) — at setup only for a new club,
// for an existing one by `mercato people life-cycle --register-schedule` after the confirmed first run (*Rollout*). The
// scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches the
// job command with a session-less job context (acting role `system`).
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext, verifyScheduledJobScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'people-life-cycle',
  id: 'people:life-cycle',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, { module: 'people', name: 'life-cycle' })
  if (!verified.ok) return
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.life_cycle', {
    input: {},
    ctx: jobCommandContext(container, verified.scope),
  })
}
