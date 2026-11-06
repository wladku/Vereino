// `payments:gateway-failed` (payments spec *Events* row `payment_gateways.payment.failed|cancelled`, DD-42; #110): a
// failed or cancelled attempt marks a `created` checkout `failed`, so M-09 shows "Payment interrupted — the charges are
// still open". Nothing is booked or released: a capture that follows is still fulfilled (late capture). Idempotent.
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { markCheckoutFailed } from '../services/checkout'
import { gatewayEventSchema } from './gateway-captured'

export const metadata = {
  event: 'payment_gateways.payment.*',
  persistent: true,
  id: 'payments:gateway-failed',
}

const FAILURE_EVENTS = new Set(['payment_gateways.payment.failed', 'payment_gateways.payment.cancelled'])

type SubscriberContext = { eventName?: string; tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  if (!ctx.eventName || !FAILURE_EVENTS.has(ctx.eventName)) return
  const parsed = gatewayEventSchema.safeParse(payload)
  if (!parsed.success) return
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  await markCheckoutFailed(container, scope, parsed.data.paymentId)
}
