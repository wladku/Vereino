// `communication:session-cancelled` (foundation III REQ-M07, J-M02 step 1; club spec J-003 step 1): when a session is
// cancelled, the session thread (one per occurrence) gets a system message with the reason and the session audience
// gets the e-mail `communication.session_cancelled`; the in-app notice stays `activities`' phase 2 one. Persistent and
// idempotent: the dispatch is keyed by the cancellation event (the session id and the version the cancellation wrote),
// so a replayed or concurrently delivered event adds nothing, while a later cancellation of the reopened session adds a
// message and one more e-mail. Runs the command under the `system_job` source of the event's organization.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'activities.occurrence.cancelled',
  persistent: true,
  id: 'communication:session-cancelled',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  actorUserId: z.uuid().nullable().optional(),
  updatedAt: z.string().min(1).optional(),
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
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('communication.threads.record_cancellation', {
    input: {
      occurrenceId: parsed.data.id,
      eventKey: `${parsed.data.id}:${parsed.data.updatedAt ?? 'cancelled'}`,
      actorUserId: parsed.data.actorUserId ?? null,
    },
    ctx: jobCommandContext(container, scope),
  })
}
