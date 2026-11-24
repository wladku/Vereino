// `people:life-cycle` (people life-cycle spec *Events, Jobs* row, DD-L09; phase L8, #310): the daily life-cycle job,
// registered per organization with `registerModuleSchedule` (`services/club-setup.ts`) — at setup only for a new club,
// for an existing one by `mercato people life-cycle --register-schedule` after the confirmed first run (*Rollout*). The
// scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches the
// job command with a session-less job context (acting role `system`).
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { clubJobWorker, jobCommandContext } from '@/modules/foundation'

const logger = createLogger('people').child({ component: 'life-cycle' })

export const metadata: WorkerMeta = {
  queue: 'people-life-cycle',
  id: 'people:life-cycle',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('people:life-cycle received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.life_cycle', {
    input: {},
    ctx: jobCommandContext(container, parsed.data),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629). */
export default clubJobWorker('people:life-cycle', handle)
