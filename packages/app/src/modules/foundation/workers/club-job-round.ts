// `foundation:club-job-round` (many-clubs spec *Observability*; #852): the round check of one sweep run of a job type
// that declares `afterSweep` (the payments invariants heartbeat). The sweep queues it with a delay and the clubs it
// enqueued; each check reads those clubs' own job-state rows in their scope, and either queues itself again after
// `ROUND_CHECK_DELAY_MS` while a run is unfinished, or reports the round once (`services/club-jobs.ts`). Idempotent:
// it writes nothing; a duplicate check only repeats the report.
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { parseClubJobRound } from '../lib/club-job-round'
import {
  CLUB_JOB_ROUND_QUEUE,
  CLUB_JOB_ROUND_WORKER,
  enqueueClubJobRound,
  stepClubJobRound,
} from '../services/club-jobs'

const logger = createLogger('foundation').child({ component: 'club-job-round-worker' })

export const metadata: WorkerMeta = {
  queue: CLUB_JOB_ROUND_QUEUE,
  id: CLUB_JOB_ROUND_WORKER,
  concurrency: 1,
}

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const round = parseClubJobRound(job.payload)
  if (!round) {
    logger.warn('foundation:club-job-round received a malformed round; skipped')
    return
  }
  const step = await stepClubJobRound(await createRequestContainer(), round)
  if (!step.done) await enqueueClubJobRound(round)
}
