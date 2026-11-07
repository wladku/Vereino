// `payments:gateway-captured` (payments spec *Events* row `payment_gateways.payment.captured`, DD-42; #110): a captured
// gateway transaction runs the checkout's fulfilment. The event carries ids only; its `paymentId` is the checkout id
// and its scope is the transaction's, so the checkout is read with both — never from event metadata. The fulfilment
// re-reads the provider state and books once (row lock and the unique gateway index), so a repeated event is a no-op.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { fulfilCheckout } from '../services/checkout'

export const metadata = {
  event: 'payment_gateways.payment.captured',
  persistent: true,
  id: 'payments:gateway-captured',
}

export const gatewayEventSchema = z.object({
  transactionId: z.uuid(),
  paymentId: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = gatewayEventSchema.safeParse(payload)
  if (!parsed.success) return
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  await fulfilCheckout(container, scope, parsed.data.paymentId)
}
