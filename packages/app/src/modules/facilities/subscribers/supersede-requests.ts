// `facilities:supersede-requests` (facilities spec glossary *External request* — "an internal booking can override
// it"; J-006 step 4; #123): when `activities` creates sessions — a coach's group event from "Book" → "For a group"
// (DD-26) or a generated series — the external requests that hold their slots become `superseded` through
// `facilities.rentals.supersede_by_sessions`, run with a session-less job context. Persistent and idempotent: a
// redelivered event finds no request left in `pending_approval`.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'activities.occurrence.generated',
  persistent: true,
  id: 'facilities:supersede-requests',
}

const payloadSchema = z.object({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  createdIds: z.array(z.uuid()).default([]),
  updatedIds: z.array(z.uuid()).default([]),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

/** At most this many sessions per command (the command's input limit). */
const BATCH = 5000

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  const occurrenceIds = [...new Set([...parsed.data.createdIds, ...parsed.data.updatedIds])]
  if (occurrenceIds.length === 0) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  for (let index = 0; index < occurrenceIds.length; index += BATCH) {
    await commandBus.execute('facilities.rentals.supersede_by_sessions', {
      input: { occurrenceIds: occurrenceIds.slice(index, index + BATCH) },
      ctx: jobCommandContext(container, scope),
    })
  }
}
