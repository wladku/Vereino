// `club_core:club-export` (many clubs spec phase 4, REQ-M06; E22-S06b, #676): one job per export the club administrator
// requested, `{ jobId, tenantId, organizationId }` written by the server. The worker runs the export as a job of that
// club and records the outcome on the platform progress job (`services/club-export.ts`); it never throws into the
// queue, so a failed export is not retried behind the administrator's back.
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { CLUB_EXPORT_QUEUE } from '../lib/club-export'
import { runClubExportJob, type ClubExportJobPayload } from '../services/club-export'

export const metadata: WorkerMeta = {
  queue: CLUB_EXPORT_QUEUE,
  id: 'club_core:club-export',
  concurrency: 1,
}

export default async function handle(job: QueuedJob<ClubExportJobPayload>): Promise<void> {
  const container = await createRequestContainer()
  await runClubExportJob(container, job.payload)
}
