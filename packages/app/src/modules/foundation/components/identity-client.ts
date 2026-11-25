// Client-side shapes and helpers of the social sign-in UI (#566): the list the identity routes answer, the provider
// names (untranslated, spec *Localization*) and the start URL of a provider.
import type { IdentityProvider } from '../lib/identity'

export type IdentityLinkRow = {
  id: string
  provider: IdentityProvider
  emailAtLink: string | null
  emailShared: boolean
  linkedAt: string
  lastSignedInAt: string | null
  updatedAt: string
}

export type IdentityListResponse = {
  items: IdentityLinkRow[]
  canUnlink: boolean
  providers: Array<{ id: IdentityProvider; enabled: boolean; linked: boolean }>
}

export const PROVIDER_NAMES: Record<IdentityProvider, string> = { google: 'Google', facebook: 'Facebook' }

/** The `start` route: a sign-in without a session, a link with one. */
export function startUrl(provider: IdentityProvider, redirect?: string | null): string {
  const base = `/api/foundation/identity/${provider}/start`
  return redirect ? `${base}?redirect=${encodeURIComponent(redirect)}` : base
}
