// `people:retention-sweep` (club spec REQ-041, amendment B, *Events, Jobs* row; #471): the daily former participants'
// retention sweep, registered per organization with `registerModuleSchedule` (`services/club-setup.ts`) — at setup for
// a new club, for an existing one by `mercato people retention-sweep --register-schedule` after the owner confirmed the
// dry run. The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context (acting role `system`).
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { jobCommandContext } from '@/modules/foundation'

const logger = createLogger('people').child({ component: 'retention-sweep' })

export const metadata: WorkerMeta = {
  queue: 'people-retention-sweep',
  id: 'people:retention-sweep',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('people:retention-sweep received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.retention_sweep', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}
