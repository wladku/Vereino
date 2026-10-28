// `people:sync-role-expiry` (foundation spec P-12, DD-G07; club spec *Events* row): the daily role recomputation,
// registered per organization with `registerModuleSchedule` from `setup.ts`. The scheduler injects the
// registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches the job command with
// a session-less job context (acting role `system`).
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('people').child({ component: 'sync-role-expiry' })

export const metadata: WorkerMeta = {
  queue: 'people-sync-role-expiry',
  id: 'people:sync-role-expiry',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('people:sync-role-expiry received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.sync_roles', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
