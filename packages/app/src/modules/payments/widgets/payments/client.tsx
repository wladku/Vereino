'use client'
// The embedded renderer of the gateway test adapter (`vereino_test`, #110): the integration runner's stand-in for the
// Stripe Payment Element that `gateway_stripe` registers. "Confirm test payment" completes the form the way Stripe's
// `confirmPayment` does, and the test then sets the provider state with a signed webhook. Only a checkout created
// under `OM_INTEGRATION_TEST` ever names this renderer.
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  registerEmbeddedPaymentGatewayRenderer,
  type PaymentGatewayRendererProps,
} from '@open-mercato/shared/modules/payment_gateways/client'
import { Button } from '@open-mercato/ui/primitives/button'

function TestGatewayForm({ disabled, onComplete }: PaymentGatewayRendererProps) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4" data-testid="test-gateway-form">
      <p className="text-muted-foreground text-sm">{t('payments.club.testGateway.hint')}</p>
      <div>
        <Button type="button" className="min-h-11" disabled={disabled} onClick={onComplete}>
          {t('payments.club.testGateway.confirm')}
        </Button>
      </div>
    </div>
  )
}

registerEmbeddedPaymentGatewayRenderer({
  providerKey: 'vereino_test',
  rendererKey: 'vereino_test.form',
  Component: TestGatewayForm,
})

/** Registration happens on import; the module exports nothing to render. */
const testGatewayClient = null

export default testGatewayClient
