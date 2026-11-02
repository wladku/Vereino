// `foundation:dispatch-deliver` (foundation III P-30, *Events, Jobs* row; #71): one job per queued e-mail delivery and one
// per dispatch with in-app deliveries, each `{ deliveryId | dispatchId, tenantId, organizationId }` written by the
// server. The worker reads the row by id and tenant and organization, leases it, renders and sends (≤ 8 e-mails/s per
// process) and records the outcome on the row; a delivery problem never throws into the queue, so the row — not the
// queue strategy — decides the retries (DD-M03).
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { processDispatchJob } from '../services/dispatch-worker'

export const metadata: WorkerMeta = {
  queue: 'foundation-dispatch',
  id: 'foundation:dispatch-deliver',
  concurrency: 5,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const container = await createRequestContainer()
  await processDispatchJob(container, job.payload)
}
