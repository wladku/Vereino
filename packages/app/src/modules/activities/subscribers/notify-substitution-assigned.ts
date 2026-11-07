// `activities:notify-substitution-assigned` (club spec *Events* row `activities.occurrence.coach_changed` →
// `activities.substitution_assigned`; README flow F-03 path A; E06-S13 #95): after the coordinator or the club
// administrator assigns a coach to a session, that coach gets the in-app notification, linking to the session as the
// coach — unless they assigned themselves. Persistent and idempotent: grouped by the substitution entry.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifySubstitutionAssigned } from '../services/substitution-notice'

export const metadata = {
  event: 'activities.occurrence.coach_changed',
  persistent: true,
  id: 'activities:notify-substitution-assigned',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  substitutionEntryId: z.uuid(),
  previousCoachPersonId: z.uuid().nullable().optional(),
  newCoachPersonId: z.uuid().nullable().optional(),
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
  await notifySubstitutionAssigned(await createRequestContainer(), scope, {
    occurrenceId: parsed.data.id,
    substitutionEntryId: parsed.data.substitutionEntryId,
    previousCoachPersonId: parsed.data.previousCoachPersonId ?? null,
    newCoachPersonId: parsed.data.newCoachPersonId ?? null,
    actorUserId: parsed.data.actorUserId ?? null,
  })
}
