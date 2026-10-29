// `activities:notify-occurrence-cancelled` (club spec glossary *Session cancellation* and *Events* row; foundation II
// DD-G12; #31): after a session is cancelled, the people it concerns get the in-app notification
// `activities.occurrence_cancelled` — the participants with an account, the guardians (with an account) of every
// participant not known to be an adult, and the coaches (the session's coach and the group's coaches and assistants on
// the session date) — never the user who cancelled. Persistent and idempotent: the notification's group key is the
// session id, so a retried delivery refreshes the same notification instead of adding one.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifyOccurrenceCancelled } from '../services/cancellation-notice'

export const metadata = {
  event: 'activities.occurrence.cancelled',
  persistent: true,
  id: 'activities:notify-occurrence-cancelled',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
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
  await notifyOccurrenceCancelled(await createRequestContainer(), scope, {
    occurrenceId: parsed.data.id,
    actorUserId: parsed.data.actorUserId ?? null,
  })
}
