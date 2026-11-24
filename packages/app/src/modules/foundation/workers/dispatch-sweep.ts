// `foundation:dispatch-sweep` (foundation III P-30, DD-M03; *Events, Jobs* row; #71): every 2 minutes per organization
// (registered with `registerModuleSchedule` from `setup.ts`), the queued deliveries that are due with a free lease are
// republished and those out of attempts are failed — so a lost job, a crashed worker or a retry after its backoff is
// resumed under either queue strategy. The scheduler injects the registration's `tenantId` and `organizationId`; the
// worker re-validates them. A finished sweep is also the worker's liveness signal: it pings the heartbeat check of
// `VEREINO_OPS_WORKER_HEARTBEAT_URL` (E18-S04 #465, `docs/ops/monitoring.md`), at most once a minute per process.
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { WORKER_HEARTBEAT_URL_VARIABLE, createWorkerHeartbeat } from '../lib/worker-heartbeat'
import { sweepDispatches } from '../services/dispatch-worker'
import { verifyScheduledJobScope } from '../services/scheduled-job-scope'

const logger = createLogger('foundation').child({ component: 'dispatch-sweep-worker' })
const heartbeat = createWorkerHeartbeat({ url: process.env[WORKER_HEARTBEAT_URL_VARIABLE] })

export const metadata: WorkerMeta = {
  queue: 'foundation-dispatch-sweep',
  id: 'foundation:dispatch-sweep',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  const verified = await verifyScheduledJobScope(container, job.payload, {
    module: 'foundation',
    name: 'dispatch-sweep',
  })
  if (!verified.ok) return
  await sweepDispatches(container, verified.scope)
  if ((await heartbeat.beat()) === 'failed') logger.warn('Worker heartbeat ping failed')
}
