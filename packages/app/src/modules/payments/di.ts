import { asFunction, asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerGatewayAdapter, registerWebhookHandler } from '@open-mercato/shared/modules/payment_gateways/types'
import { createTokenLinkService, registerEmailTemplate } from '@/modules/foundation'
import { OrderLink } from './data/entities'
import { cashReceivedTemplate, orderCopyTemplate, orderLinkTemplate, orderReminderTemplate } from './emails/templates'
import { ORDER_LINK_TTL_MS } from './lib/orders'
import { PAYMENTS_ORDER_LINKS } from './services/order-links'
import { PAYMENTS_PUBLIC_PRICES, createPublicPrices } from './services/public-prices'
import { TEST_GATEWAY_PROVIDER, readTestGatewaySessionId, testGatewayAdapter } from './services/test-gateway'

/**
 * The online checkout's gateway provider (DD-42): the club's Stripe account, or — only in the ephemeral integration
 * runner (`OM_INTEGRATION_TEST=true`) — the gateway test adapter (#110).
 */
export function checkoutProviderKey(): string {
  return process.env.OM_INTEGRATION_TEST === 'true' ? TEST_GATEWAY_PROVIDER : 'stripe'
}

/**
 * `payments.publicPrices` (club spec DD-28; payments spec REQ-026; #112): the prices block of a section's public page —
 * each public group's fee and the sibling discount — which `club_core` reads with `hasRegistration`
 * (`club_core/services/public-blocks.ts`). With `payments` disabled the token is absent and the page has no prices.
 *
 * The e-mail template `payments.cash_received` (P-31; REQ-031, #114) is registered for every request and job
 * container, so the dispatch worker finds it. It goes out by e-mail only (the recipient's channel), so it declares no
 * in-app notification type.
 *
 * `payments.orderLinks` (REQ-032, #116; foundation P-10): the token-link service of `payments_order_links`
 * (`until_expiry`, at most 120 days, a link ends with the orders deadline) — the single DD-35 lookup of that table.
 * The order copy and the personal link e-mails (`payments.order_copy`, `payments.order_link`) are registered with the
 * other templates.
 */
const orderLinks = createTokenLinkService(OrderLink, { use: 'until_expiry', ttlMs: ORDER_LINK_TTL_MS })

export function register(container: AppContainer) {
  registerEmailTemplate(container, cashReceivedTemplate)
  registerEmailTemplate(container, orderReminderTemplate)
  registerEmailTemplate(container, orderCopyTemplate)
  registerEmailTemplate(container, orderLinkTemplate)
  container.register({
    [PAYMENTS_ORDER_LINKS]: asValue(orderLinks),
    [PAYMENTS_PUBLIC_PRICES]: asFunction(() => createPublicPrices(container)).scoped(),
  })
  // The gateway registries live on `globalThis`, so registering again for every container replaces the same entry.
  if (checkoutProviderKey() !== TEST_GATEWAY_PROVIDER) return
  registerGatewayAdapter(testGatewayAdapter)
  registerWebhookHandler(TEST_GATEWAY_PROVIDER, (input) => testGatewayAdapter.verifyWebhook(input), {
    readSessionIdHint: readTestGatewaySessionId,
  })
}
