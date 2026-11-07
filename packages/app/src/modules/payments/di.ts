import { asFunction } from 'awilix'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { registerEmailTemplate } from '@/modules/foundation'
import { cashReceivedTemplate } from './emails/templates'
import { PAYMENTS_PUBLIC_PRICES, createPublicPrices } from './services/public-prices'

/**
 * `payments.publicPrices` (club spec DD-28; payments spec REQ-026; #112): the prices block of a section's public page —
 * each public group's fee and the sibling discount — which `club_core` reads with `hasRegistration`
 * (`club_core/services/public-blocks.ts`). With `payments` disabled the token is absent and the page has no prices.
 *
 * The e-mail template `payments.cash_received` (P-31; REQ-031, #114) is registered for every request and job
 * container, so the dispatch worker finds it. It goes out by e-mail only (the recipient's channel), so it declares no
 * in-app notification type.
 */
export function register(container: AppContainer) {
  registerEmailTemplate(container, cashReceivedTemplate)
  container.register({
    [PAYMENTS_PUBLIC_PRICES]: asFunction(() => createPublicPrices(container)).scoped(),
  })
}
