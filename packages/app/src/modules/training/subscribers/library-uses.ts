// `training:library-uses` (training outlines spec *Events* → `activities.occurrence.completed`, glossary *Use*, DD-O12;
// #685): a closed session whose outline came from a library entry records a use for the session's coach and every
// coach or assistant of its group, so each of them may rate the entry. A cancelled session never closes, so it records
// none. Persistent; a redelivery counts the session again (`occurrence_count`), never a second user.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'activities.occurrence.completed',
  persistent: true,
  id: 'training:library-uses',
}

const payloadSchema = z.object({ id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid() })

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
  await container.resolve<CommandBus>('commandBus').execute('training.library.record_uses', {
    input: { occurrenceId: parsed.data.id },
    ctx: jobCommandContext(container, scope),
  })
}
