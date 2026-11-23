import { asFunction, asValue } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerNotificationTypes } from '@open-mercato/core/modules/notifications/lib/notification-type-registry'
import { registerGatewayAdapter, registerWebhookHandler } from '@open-mercato/shared/modules/payment_gateways/types'
import { createTokenLinkService, registerEmailTemplate, registerClubDataContributor } from '@/modules/foundation'
import { OrderLink } from './data/entities'
import {
  cashReceivedTemplate,
  chargeReminderTemplate,
  orderCopyTemplate,
  orderLinkTemplate,
  orderReminderTemplate,
} from './emails/templates'
import { ORDER_LINK_TTL_MS } from './lib/orders'
import notificationTypes from './notifications'
import { PAYMENTS_CHARGE_SERVICE, createChargeService } from './services/charge-service'
import { PAYMENTS_DEPARTURE_CONTRIBUTOR, departureContribution } from './services/departure-contribution'
import { PAYMENTS_ORDER_LINKS } from './services/order-links'
import { PAYMENTS_PUBLIC_PRICES, createPublicPrices } from './services/public-prices'
import { PAYMENTS_SEASON_CONTRIBUTOR, seasonContribution } from './services/season-rollover'
import { TEST_GATEWAY_PROVIDER, readTestGatewaySessionId, testGatewayAdapter } from './services/test-gateway'
import { PAYMENTS_CLUB_TABLES } from './lib/club-tables'

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
 * other templates, and so is the coach's overdue reminder (`payments.charge_reminder`, REQ-033, #117).
 *
 * The in-app type `payments.charge_overdue` of the daily overdue reminder (DD-C09, #301) is registered here as well
 * as through `notifications.ts`, because the dispatch worker's runtime does not load the platform registry
 * (lesson `notification-type-registry-in-worker-runtime`).
 *
 * `payments.chargeService` (payments parity spec REQ-C01, DD-C01, #291): the rental charge service `facilities`
 * resolves with `hasRegistration` (facilities DD-19). It is stateless: every call writes through the caller's `em`.
 */
const orderLinks = createTokenLinkService(OrderLink, {
  use: 'until_expiry',
  ttlMs: ORDER_LINK_TTL_MS,
  dedicatedTable: true,
})
const chargeService = createChargeService()

export function register(container: AppContainer) {
  registerClubDataContributor(container, 'payments', PAYMENTS_CLUB_TABLES)
  registerNotificationTypes(notificationTypes)
  registerEmailTemplate(container, cashReceivedTemplate)
  registerEmailTemplate(container, orderReminderTemplate)
  registerEmailTemplate(container, orderCopyTemplate)
  registerEmailTemplate(container, orderLinkTemplate)
  registerEmailTemplate(container, chargeReminderTemplate)
  container.register({
    [PAYMENTS_ORDER_LINKS]: asValue(orderLinks),
    [PAYMENTS_CHARGE_SERVICE]: asValue(chargeService),
    // `groups.season.payments` (people life-cycle spec REQ-L08, #311): the season contributor `groups` reads with
    // `hasRegistration` — the fees of the rolled-over groups end and may be copied. Stateless: the caller's transaction.
    [PAYMENTS_SEASON_CONTRIBUTOR]: asValue(seasonContribution),
    // `people.departure.payments` (people life-cycle spec REQ-L04, #307): the departure contributor `people` reads with
    // `hasRegistration` — cash a leaving person holds blocks the departure, open charges warn; `retentionHoldUntil`
    // for the erasure (phase L6). Stateless: the caller's EntityManager.
    [PAYMENTS_DEPARTURE_CONTRIBUTOR]: asValue(departureContribution),
    [PAYMENTS_PUBLIC_PRICES]: asFunction(() => createPublicPrices(container)).scoped(),
  })
  // The gateway registries live on `globalThis`, so registering again for every container replaces the same entry.
  if (checkoutProviderKey() !== TEST_GATEWAY_PROVIDER) return
  registerGatewayAdapter(testGatewayAdapter)
  registerWebhookHandler(TEST_GATEWAY_PROVIDER, (input) => testGatewayAdapter.verifyWebhook(input), {
    readSessionIdHint: readTestGatewaySessionId,
  })
}
