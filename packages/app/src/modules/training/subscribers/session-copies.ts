// `training:session-copies` (training outlines spec DD-O07, *Events* → `activities.occurrence.generated`; REQ-O07;
// #683): when `activities` creates, moves or removes sessions of a series, `training.outlines.sync_sessions` gives each
// created session of an activity with a series outline its own copy and settles the copies of removed sessions (an
// unedited one is deleted, an edited one kept detached), run with a session-less job context. Persistent and
// idempotent: the unique session index and the "no outline yet" check make a redelivered event copy nothing twice.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'activities.occurrence.generated',
  persistent: true,
  id: 'training:session-copies',
}

const payloadSchema = z.object({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  createdIds: z.array(z.uuid()).default([]),
  removedIds: z.array(z.uuid()).default([]),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

/** At most this many sessions per command (the command's input limit). */
const BATCH = 5000

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  const { createdIds, removedIds } = parsed.data
  if (createdIds.length + removedIds.length === 0) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  for (let index = 0; index < Math.max(createdIds.length, removedIds.length); index += BATCH) {
    await commandBus.execute('training.outlines.sync_sessions', {
      input: { createdIds: createdIds.slice(index, index + BATCH), removedIds: removedIds.slice(index, index + BATCH) },
      ctx: jobCommandContext(container, scope),
    })
  }
}
