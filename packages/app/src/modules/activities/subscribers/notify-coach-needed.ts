// `activities:notify-coach-needed` (club spec *Events* row `activities.occurrence.coach_unassigned`; README flow F-03
// path A; E06-S13 #95): after the assigned coach reports an absence, the coordinators of the session's section (the club
// administrators when it has none) get the in-app `activities.coach_needed` notification, never the coach who reported
// it. Persistent and idempotent: grouped by the substitution entry, so a retried delivery refreshes it.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifyCoachNeeded } from '../services/substitution-notice'

export const metadata = {
  event: 'activities.occurrence.coach_unassigned',
  persistent: true,
  id: 'activities:notify-coach-needed',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  substitutionEntryId: z.uuid(),
  previousCoachPersonId: z.uuid().nullable().optional(),
  actorUserId: z.uuid().nullable().optional(),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  await notifyCoachNeeded(await createRequestContainer(), scope, {
    occurrenceId: parsed.data.id,
    substitutionEntryId: parsed.data.substitutionEntryId,
    previousCoachPersonId: parsed.data.previousCoachPersonId ?? null,
    newCoachPersonId: null,
    actorUserId: parsed.data.actorUserId ?? null,
  })
}
