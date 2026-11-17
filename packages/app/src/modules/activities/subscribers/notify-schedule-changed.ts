// `activities:notify-schedule-changed` (groups and activities parity spec REQ-A09, DD-A08, *Events* row; #271): after a
// series edit (or its undo) moved future sessions, the audience of the first changed session gets one in-app
// notification `activities.occurrence_moved` naming the first changed date, the number of changed sessions and the new
// rule — never the person who made the change. An `activities.activity.updated` without `scheduleChange` (a description,
// a coach or a deadline alone) is ignored. Persistent and idempotent: the group key is the activity id plus the version
// the edit wrote. (The spec names "the same two subscribers"; a subscriber listens to one event, so the series half of
// each is its own file.)
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifyScheduleChanged } from '../services/session-notice'

export const metadata = {
  event: 'activities.activity.updated',
  persistent: true,
  id: 'activities:notify-schedule-changed',
}

const ruleSchema = z.object({
  startTime: z.string().min(1).max(8),
  endTime: z.string().min(1).max(8),
  placeId: z.uuid().nullable(),
  venueName: z.string().max(200).nullable(),
  gatheringMinutesBefore: z.number().int().nullable(),
})

const scheduleChangeSchema = z.object({
  from: z.iso.date(),
  movedCount: z.number().int().min(1),
  before: ruleSchema,
  after: ruleSchema,
})

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  scheduleChange: scheduleChangeSchema,
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
  await notifyScheduleChanged(await createRequestContainer(), scope, {
    activityId: parsed.data.id,
    scheduleChange: parsed.data.scheduleChange,
    actor: {
      userId: parsed.data.actorUserId ?? null,
      personId: parsed.data.actorPersonId ?? null,
      actingRole: parsed.data.actingRole ?? null,
    },
    updatedAt: parsed.data.updatedAt,
  })
}
