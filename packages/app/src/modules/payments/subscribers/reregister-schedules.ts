// `payments:reregister-schedules` (#405): the charge generation (06:00), the overdue reminders (09:00) and the
// invariant check (03:00, #531) run in the club's time zone, so a `club_core.settings.updated` re-registers the club's
// schedules — an upsert on the stable id of job and organization, a no-op when the zone did not change — as
// `activities:reregister-schedule` does for its jobs. Persistent: a failed registration throws, so the queue retries
// the event.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { setUpClubPayments } from '../services/club-setup'

export const metadata = {
  event: 'club_core.settings.updated',
  persistent: true,
  id: 'payments:reregister-schedules',
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
  const container = await createRequestContainer()
  const { schedules } = await setUpClubPayments(container, scope)
  const failed = Object.entries(schedules)
    .filter(([, registered]) => !registered)
    .map(([name]) => name)
  if (failed.length > 0) {
    throw new Error(`[internal] payments schedules not re-registered: ${failed.join(', ')}`)
  }
}
