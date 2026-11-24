// `people:life-cycle` (people life-cycle spec *Events, Jobs* row, DD-L09; phase L8, #310): the daily life-cycle job,
// registered per organization with `registerModuleSchedule` (`services/club-setup.ts`) — at setup only for a new club,
// for an existing one by `mercato people life-cycle --register-schedule` after the confirmed first run (*Rollout*). The
// scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches the
// job command with a session-less job context (acting role `system`).
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'people-life-cycle',
  id: 'people:life-cycle',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.life_cycle', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('people:life-cycle', handle)
