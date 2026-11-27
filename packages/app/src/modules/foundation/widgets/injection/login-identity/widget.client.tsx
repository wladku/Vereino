'use client'
// "Sign in with Google" on `/login` (social sign-in spec `/login` UI row; REQ-S01, REQ-S04; #566), on the platform
// spot `auth.login:form`. One outline button per enabled provider, after the password form (`order-last` in the form's
// grid); each is a link to the provider's `start` route, which carries the page's `redirect`. Any `?identity=` outcome
// shows one sentence in the form's own error area (`aria-live="polite"`), so `unlinked`, `invalid` and `failed` read
// the same (no enumeration). A `?second_factor=expired|use_google` sentence of the staff second factor (#736) shows in
// the same area.
import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import type { LoginFormWidgetContext } from '@open-mercato/core/modules/auth/frontend/login-injection'
import type { IdentityProvider } from '../../../lib/identity'
import { PROVIDER_NAMES, startUrl } from '../../../components/identity-client'
import { ProviderMark } from '../../../components/ProviderMark'

const OUTCOMES = new Set(['unlinked', 'invalid', 'failed'])
/** Staff second factor (#736): `?second_factor=` sentences of an ended challenge and of a refused provider. */
const SECOND_FACTOR_SENTENCES: Record<string, string> = {
  expired: 'foundation.secondFactor.login.expired',
  use_google: 'foundation.errors.second_factor_use_google',
}

export default function LoginIdentityWidget({
  context,
}: InjectionWidgetComponentProps<LoginFormWidgetContext, Record<string, unknown>>) {
  const t = useT()
  const outcome = context.searchParams.get('identity')
  const redirect = context.searchParams.get('redirect')
  const setError = context.setError
  const [providers, setProviders] = React.useState<IdentityProvider[]>([])

  // The login page may render outside a query client, so the providers are read once with a plain call; a failure
  // shows no button (the password form stays).
  React.useEffect(() => {
    let active = true
    void apiCall<{ providers?: Array<{ id: IdentityProvider; enabled: boolean }> }>(
      '/api/foundation/identity/providers',
    ).then(
      (call) => {
        if (!active || !call.ok || !call.result) return
        setProviders(
          (call.result.providers ?? []).filter((provider) => provider.enabled).map((provider) => provider.id),
        )
      },
      () => undefined,
    )
    return () => {
      active = false
    }
  }, [])

  const secondFactor = context.searchParams.get('second_factor')
  React.useEffect(() => {
    if (outcome && OUTCOMES.has(outcome)) setError(t('foundation.identity.login.generic'))
    else if (secondFactor && SECOND_FACTOR_SENTENCES[secondFactor]) setError(t(SECOND_FACTOR_SENTENCES[secondFactor]))
  }, [outcome, secondFactor, setError, t])

  if (providers.length === 0) return null
  return (
    <div className="order-last mt-2 flex flex-col gap-3" data-testid="login-identity">
      <div className="text-muted-foreground flex items-center gap-3 text-xs" aria-hidden="true">
        <span className="bg-border h-px flex-1" />
        <span>{t('foundation.identity.login.or')}</span>
        <span className="bg-border h-px flex-1" />
      </div>
      {providers.map((provider) => (
        <Button key={provider} asChild variant="outline" className="min-h-11 w-full">
          <a href={startUrl(provider, redirect)} data-testid={`login-identity-${provider}`}>
            <ProviderMark provider={provider} />
            {t('foundation.identity.login.signInWith', { provider: PROVIDER_NAMES[provider] })}
          </a>
        </Button>
      ))}
    </div>
  )
}
