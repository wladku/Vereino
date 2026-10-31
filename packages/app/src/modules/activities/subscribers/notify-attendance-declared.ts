// `activities:notify-attendance-declared` (club spec *Events, Jobs, Notifications* row `activities.attendance.declared`;
// foundation II DD-G12; #32): after a minor declares for themself, the ward's guardians with an account get
// `activities.ward_declared` (`immediate`) or `activities.guardian_confirmation_needed` (`guardian_confirm`). A
// declaration by a guardian or by staff, and an undo, send nothing (the payload's `guardianNotice` is null).
// Persistent and idempotent: the notification's group key is the declaration id, so a retried delivery refreshes it.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifyGuardiansOfDeclaration } from '../services/declaration-notice'

export const metadata = {
  event: 'activities.attendance.declared',
  persistent: true,
  id: 'activities:notify-attendance-declared',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  guardianNotice: z.enum(['ward_declared', 'guardian_confirmation_needed']).nullable().optional(),
  actorUserId: z.uuid().nullable().optional(),
  undo: z.boolean().optional(),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success || !parsed.data.guardianNotice || parsed.data.undo) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  await notifyGuardiansOfDeclaration(await createRequestContainer(), scope, {
    attendanceId: parsed.data.id,
    notice: parsed.data.guardianNotice,
    actorUserId: parsed.data.actorUserId ?? null,
  })
}
