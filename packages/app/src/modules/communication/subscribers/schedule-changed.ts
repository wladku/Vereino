// `communication:schedule-changed` (groups and activities parity spec REQ-A09, DD-A08, *Events* row; #271): when a
// series edit (or its undo) moved future sessions, the activity's thread gets one system message naming the first
// changed date, the number of changed sessions and the new rule, and the activity's audience gets one e-mail
// `communication.session_moved`. An `activities.activity.updated` without `scheduleChange` is ignored. Persistent and
// idempotent: the dispatch is keyed by the activity id and the version the edit wrote. (The spec names "the same two
// subscribers"; a subscriber listens to one event, so the series half of each is its own file.)
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'activities.activity.updated',
  persistent: true,
  id: 'communication:schedule-changed',
}

const ruleSchema = z.object({
  startTime: z.string().min(1).max(8),
  endTime: z.string().min(1).max(8),
  placeId: z.uuid().nullable(),
  venueName: z.string().max(200).nullable(),
  gatheringMinutesBefore: z.number().int().nullable(),
})

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  scheduleChange: z.object({
    from: z.iso.date(),
    movedCount: z.number().int().min(1),
    before: ruleSchema,
    after: ruleSchema,
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
      activityId: parsed.data.id,
      eventKey: `${parsed.data.id}:${parsed.data.updatedAt}`,
      scheduleChange: parsed.data.scheduleChange,
      actorUserId: parsed.data.actorUserId ?? null,
      actorPersonId: parsed.data.actorPersonId ?? null,
      actingRole: parsed.data.actingRole ?? null,
    },
    ctx: jobCommandContext(container, scope),
  })
}
