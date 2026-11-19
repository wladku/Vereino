// The online payment connection of a club (payments parity spec REQ-C14, DD-C11, V-C01; issue #302 E12-S12): whether
// the organization's Stripe integration is enabled and in which mode its stored credentials are. The installed
// `integrations` services are resolved from DI; the credentials stay in the server — only the mode is returned. Any
// failure to read them (the module absent, encryption unavailable, a database error) is `unknown`, which the tab shows
// as "not verified".
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { onlineConnectionOf, type OnlineConnection } from '../lib/online-payment'
import type { PaymentsScope } from './directory'

const logger = createLogger('payments').child({ component: 'online-connection' })

/** The integration id of `@open-mercato/gateway-stripe` (its `integration.ts`). */
export const STRIPE_INTEGRATION_ID = 'gateway_stripe'

type CredentialsService = {
  resolve(integrationId: string, scope: PaymentsScope): Promise<Record<string, unknown> | null>
}
type StateService = { isEnabled(integrationId: string, scope: PaymentsScope): Promise<boolean> }

const CREDENTIALS_SERVICE = 'integrationCredentialsService'
const STATE_SERVICE = 'integrationStateService'

export async function onlineConnection(container: AwilixContainer, scope: PaymentsScope): Promise<OnlineConnection> {
  if (!container.hasRegistration(CREDENTIALS_SERVICE) || !container.hasRegistration(STATE_SERVICE)) return 'unknown'
  try {
    const scoped = { tenantId: scope.tenantId, organizationId: scope.organizationId }
    const enabled = await container.resolve<StateService>(STATE_SERVICE).isEnabled(STRIPE_INTEGRATION_ID, scoped)
    if (!enabled) return 'not_connected'
    const credentials = await container
      .resolve<CredentialsService>(CREDENTIALS_SERVICE)
      .resolve(STRIPE_INTEGRATION_ID, scoped)
    return onlineConnectionOf({ enabled, credentials })
  } catch (error) {
    logger.warn('Online payment connection could not be read', {
      err: error instanceof Error ? error.message : 'unknown',
    })
    return 'unknown'
  }
}
