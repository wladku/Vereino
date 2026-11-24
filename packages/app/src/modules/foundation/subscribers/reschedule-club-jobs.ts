// `foundation:reschedule-club-jobs` (many-clubs spec *Events, Jobs* row `club_core.settings.updated`, DD-M05; #629):
// the time-of-day jobs of the club sweep run at the club's local time, so a settings change moves each of them to the
// next local run in the (new) zone — one place for every module, including the `facilities` and `people` jobs that
// had no re-register subscriber. A no-op when the zone did not change. Persistent: a failure is retried by the queue.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { rescheduleTimeOfDayJobs } from '../services/club-jobs'

export const metadata = {
  event: 'club_core.settings.updated',
  persistent: true,
  id: 'foundation:reschedule-club-jobs',
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  await rescheduleTimeOfDayJobs(await createRequestContainer(), scope)
}
