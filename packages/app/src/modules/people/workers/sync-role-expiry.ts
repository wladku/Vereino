// `people:sync-role-expiry` (foundation spec P-12, DD-G07; club spec *Events* row): the daily role recomputation,
// registered per organization with `registerModuleSchedule` from `setup.ts`. The scheduler injects the
// registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches the job command with
// a session-less job context (acting role `system`).
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'people-sync-role-expiry',
  id: 'people:sync-role-expiry',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.sync_roles', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('people:sync-role-expiry', handle)
