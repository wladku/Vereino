// `facilities:payment-recorded` (facilities parity spec DD-R09, REQ-R06; the `payments.payment.recorded` row of
// *Events*; #285): a payment recorded on a charge — on B-22, by cash, by a bank transfer or online — confirms the
// rental that charge belongs to through `facilities.rentals.confirm_paid`, run with a session-less job context. The
// subscriber is always discovered (subscribers are static) and does nothing while `payments.chargeService` is not
// registered. Persistent and repeat-safe: a redelivered event finds the rental already confirmed.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import { chargeService } from '../services/charges'

export const metadata = {
  event: 'payments.payment.recorded',
  persistent: true,
  id: 'facilities:payment-recorded',
}

const payloadSchema = z.object({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  chargeId: z.uuid(),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  const container = await createRequestContainer()
  if (!chargeService(container)) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  await container.resolve<CommandBus>('commandBus').execute('facilities.rentals.confirm_paid', {
    input: { chargeId: parsed.data.chargeId },
    ctx: jobCommandContext(container, scope),
  })
}
