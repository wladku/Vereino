'use client'
// "Connected accounts" on `/club/profile` (social sign-in spec `/club/profile` UI row; REQ-S02; J-S01; #566), on the
// spot `vereino:club:profile:sign-in` that `people`'s profile page renders below the password. The callback of a link
// round trip lands here with `?identity=linked|failed&provider=` and the outcome is announced.
import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { isIdentityProvider } from '../../../lib/identity'
import { IdentityLinks } from '../../../components/IdentityLinks'
import { PROVIDER_NAMES } from '../../../components/identity-client'

export default function ProfileIdentitiesWidget() {
  const t = useT()
  const params = useSearchParams()
  const outcome = params.get('identity')
  const provider = params.get('provider')
  const name = isIdentityProvider(provider) ? PROVIDER_NAMES[provider] : ''
  const initialOutcome =
    outcome === 'linked'
      ? { kind: 'success' as const, text: t('foundation.identity.flash.linked', { provider: name }) }
      : outcome === 'failed'
        ? { kind: 'error' as const, text: t('foundation.identity.profile.failed') }
        : null
  return (
    <section
      aria-labelledby="club-profile-identities"
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      data-testid="club-profile-identities"
    >
      <h2 id="club-profile-identities" className="text-lg font-semibold">
        {t('foundation.identity.title')}
      </h2>
      <p className="text-muted-foreground max-w-prose text-sm">{t('foundation.identity.profile.lead')}</p>
      <IdentityLinks url="/api/foundation/identity/me" own initialOutcome={initialOutcome} />
    </section>
  )
}
