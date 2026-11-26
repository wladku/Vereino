// `training:library-level` (training outlines spec BR-O5, *Events* → `club_core.settings.updated`; #685): after a club
// lowers its widest outline library level, its entries above the new level are withdrawn. The payload carries ids only,
// so the job reads the level itself; idempotent (nothing above the level is left after the first run).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'club_core.settings.updated',
  persistent: true,
  id: 'training:library-level',
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
  await container.resolve<CommandBus>('commandBus').execute('training.library.apply_level', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}
