// `training:library-author` (training outlines spec REQ-O14, glossary *Author credit*; #685): when a person's record
// changes and they no longer hold the name consent (DD-29), their name leaves every library entry of the outlines they
// wrote and the copies crediting them. The job checks the consent itself (the payload carries ids only); idempotent.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'people.person.updated',
  persistent: true,
  id: 'training:library-author',
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
  await container.resolve<CommandBus>('commandBus').execute('training.library.strip_author', {
    input: { personId: parsed.data.id },
    ctx: jobCommandContext(container, scope),
  })
}
