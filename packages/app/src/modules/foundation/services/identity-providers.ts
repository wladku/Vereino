// The provider registry of social sign-in (spec DD-S01; #566): the authorization URL with PKCE S256 and the code
// exchange, through `arctic`'s generic `OAuth2Client` so the endpoints come from `identityProviderConfig` (Google's
// own, or the test fake's — V-S04). The id token is decoded here and its claims checked by `idTokenIdentity`
// (option 1 of V-S04: TLS back channel, no signature check). Only the routes import this file — never `di.ts` or a
// command — so the ESM-only `arctic` stays out of the CLI.
import { CodeChallengeMethod, OAuth2Client, decodeIdToken, generateCodeVerifier } from 'arctic'
import {
  TOKEN_TIMEOUT_MS,
  idTokenIdentity,
  identityProviderConfig,
  withTimeout,
  type IdentityProvider,
  type IdentityProviderConfig,
  type ProviderIdentity,
} from '../lib/identity'

/** The configuration of an enabled provider from the process environment, or null when it is disabled. */
export function providerConfig(provider: IdentityProvider): IdentityProviderConfig | null {
  return identityProviderConfig(provider, process.env, process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || null)
}

function clientFor(config: IdentityProviderConfig): OAuth2Client {
  return new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri)
}

/** A fresh PKCE verifier and the provider's authorization URL for `state`. */
export function authorizationRequest(config: IdentityProviderConfig, state: string): { url: URL; verifier: string } {
  const verifier = generateCodeVerifier()
  const url = clientFor(config).createAuthorizationURLWithPKCE(
    config.authorizationUrl,
    state,
    CodeChallengeMethod.S256,
    verifier,
    [...config.scopes],
  )
  return { url, verifier }
}

/**
 * Exchanges the code at the token endpoint (5 s limit) and returns the identity of the id token, or null when a claim
 * fails. Throws on a provider error, a timeout or a transport failure — the callback turns both into
 * `identity=failed`.
 */
export async function exchangeCode(
  config: IdentityProviderConfig,
  code: string,
  verifier: string,
): Promise<ProviderIdentity | null> {
  const tokens = await withTimeout(clientFor(config).validateAuthorizationCode(config.tokenUrl, code, verifier), TOKEN_TIMEOUT_MS)
  return idTokenIdentity(decodeIdToken(tokens.idToken()), config, Date.now())
}
