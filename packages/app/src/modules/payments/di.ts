import { registerGatewayAdapter, registerWebhookHandler } from '@open-mercato/shared/modules/payment_gateways/types'
import { TEST_GATEWAY_PROVIDER, readTestGatewaySessionId, testGatewayAdapter } from './services/test-gateway'

/**
 * The online checkout's gateway provider (DD-42): the club's Stripe account, or — only in the ephemeral integration
 * runner (`OM_INTEGRATION_TEST=true`) — the gateway test adapter (#110).
 */
export function checkoutProviderKey(): string {
  return process.env.OM_INTEGRATION_TEST === 'true' ? TEST_GATEWAY_PROVIDER : 'stripe'
}

export function register(): void {
  // The gateway registries live on `globalThis`, so registering again for every container replaces the same entry.
  if (checkoutProviderKey() !== TEST_GATEWAY_PROVIDER) return
  registerGatewayAdapter(testGatewayAdapter)
  registerWebhookHandler(TEST_GATEWAY_PROVIDER, (input) => testGatewayAdapter.verifyWebhook(input), {
    readSessionIdHint: readTestGatewaySessionId,
  })
}
