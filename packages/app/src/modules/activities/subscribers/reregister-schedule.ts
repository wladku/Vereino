// `activities:reregister-schedule` (foundation II *Events* row `club_core.settings.updated`): the generator's cron runs
// in the club's time zone, so a settings change re-registers it (an upsert on the stable id; a no-op when the zone did
// not change). Persistent, so a failed registration is retried by the queue.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { registerGenerateSchedule } from '../services/club-setup'

export const metadata = {
  event: 'club_core.settings.updated',
  persistent: true,
  id: 'activities:reregister-schedule',
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
  await registerGenerateSchedule(await createRequestContainer(), scope)
}
