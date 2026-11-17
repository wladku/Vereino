// `activities:notify-occurrence-moved` (groups and activities parity spec REQ-A09, *Events* row; D-031 §7; #271): after
// a session moves (time, place or venue, gathering time), its move is undone, or it is restored, the people a
// cancellation would tell get the in-app notification `activities.occurrence_moved` with the old and the new values —
// on the session's new date, never the person who made the change; a coach's change also tells the section's
// coordinators. An event without `change` (a coach or deadline change, the `needs_reschedule` flag) is ignored.
// Persistent and idempotent: the group key is the session id plus the version the change wrote, so a replayed or
// concurrently delivered event refreshes the same notification.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { SESSION_CHANGE_KINDS } from '../lib/session-change'
import { notifySessionMoved } from '../services/session-notice'

export const metadata = {
  event: 'activities.occurrence.updated',
  persistent: true,
  id: 'activities:notify-occurrence-moved',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  change: z.object({
    kinds: z.array(z.enum(SESSION_CHANGE_KINDS)).min(1),
    before: z.object({
      startAt: z.iso.datetime(),
      endAt: z.iso.datetime(),
      placeId: z.uuid().nullable(),
      venueName: z.string().max(200).nullable(),
      gatheringMinutesBefore: z.number().int().nullable(),
    }),
  }),
  actorUserId: z.uuid().nullable().optional(),
  actorPersonId: z.uuid().nullable().optional(),
  actingRole: z.string().min(1).max(40).nullable().optional(),
  updatedAt: z.string().min(1),
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
  await notifySessionMoved(await createRequestContainer(), scope, {
    occurrenceId: parsed.data.id,
    change: parsed.data.change,
    actor: {
      userId: parsed.data.actorUserId ?? null,
      personId: parsed.data.actorPersonId ?? null,
      actingRole: parsed.data.actingRole ?? null,
    },
    updatedAt: parsed.data.updatedAt,
  })
}
