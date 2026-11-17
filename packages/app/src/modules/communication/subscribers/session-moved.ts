// `communication:session-moved` (groups and activities parity spec REQ-A09, DD-A07, *Events* row; D-031 §7; J-A03 step
// 3; #271): when a session moves (time, place or venue, gathering time), its move is undone, or it is restored, the
// session thread gets a system message naming who changed it and the old and the new values, and the session audience
// gets the e-mail `communication.session_moved`; the in-app notice is `activities`' `activities:notify-occurrence-moved`.
// An event without `change` (a coach or deadline change, the `needs_reschedule` flag) is ignored, and a session
// cancelled meanwhile announces nothing. Persistent and idempotent: the dispatch is keyed by the session id and the
// version the change wrote, so a replayed or concurrently delivered event adds nothing. Runs the command under the
// `system_job` source of the event's organization.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'activities.occurrence.updated',
  persistent: true,
  id: 'communication:session-moved',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  change: z.object({
    kinds: z.array(z.enum(['time', 'place', 'gathering', 'restored'])).min(1),
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
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('communication.threads.record_reschedule', {
    input: {
      occurrenceId: parsed.data.id,
      eventKey: `${parsed.data.id}:${parsed.data.updatedAt}`,
      change: { kinds: parsed.data.change.kinds, before: parsed.data.change.before },
      actorUserId: parsed.data.actorUserId ?? null,
      actorPersonId: parsed.data.actorPersonId ?? null,
      actingRole: parsed.data.actingRole ?? null,
    },
    ctx: jobCommandContext(container, scope),
  })
}
