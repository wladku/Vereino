// `foundation:dispatch-sweep` (foundation III P-30, DD-M03; *Events, Jobs* row; #71): every 2 minutes per organization
// (registered with `registerModuleSchedule` from `setup.ts`), the queued deliveries that are due with a free lease are
// republished and those out of attempts are failed — so a lost job, a crashed worker or a retry after its backoff is
// resumed under either queue strategy. The scheduler injects the registration's `tenantId` and `organizationId`; the
// worker re-validates them.
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { sweepDispatches } from '../services/dispatch-worker'

const logger = createLogger('foundation').child({ component: 'dispatch-sweep-worker' })

export const metadata: WorkerMeta = {
  queue: 'foundation-dispatch-sweep',
  id: 'foundation:dispatch-sweep',
  concurrency: 1,
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('foundation:dispatch-sweep received a payload without a valid scope; skipped')
    return
  }
  const container = await createRequestContainer()
  await sweepDispatches(container, parsed.data)
}
