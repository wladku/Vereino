// `payments:guardianship-payer-created` (payments parity spec *Events* row `people.guardianship.created|updated`,
// *Domain Vocabulary* → Automatic payer assignment; Contract 4; #295): when a guardianship is created, the ward's
// `open` or `partially_paid` charges without a payer get the ward's current primary payer through
// `payments.charges.assign_payer`, run with a session-less job context. The ward comes from the event's
// `wardPersonId` (Contract 6); an event without it (emitted before Contract 6) is ignored. Persistent and idempotent:
// the command re-reads the primary payer and skips charges that already have one, so a replay changes nothing.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'people.guardianship.created',
  persistent: true,
  id: 'payments:guardianship-payer-created',
}

export const guardianshipPayloadSchema = z.object({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  wardPersonId: z.uuid(),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export async function assignWardPayer(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = guardianshipPayloadSchema.safeParse(payload)
  if (!parsed.success) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('payments.charges.assign_payer', {
    input: { wardPersonId: parsed.data.wardPersonId },
    ctx: jobCommandContext(container, scope),
  })
}

export default assignWardPayer
