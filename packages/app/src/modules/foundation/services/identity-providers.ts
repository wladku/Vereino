// The provider registry of social sign-in (spec DD-S01; #566, Facebook #567): the authorization URL with PKCE S256
// through `arctic`'s generic `OAuth2Client`, so the endpoints come from `identityProviderConfig` (the provider's own,
// or the test fake's — V-S04), and the code exchange. Google (`oidc`): the id token is decoded here and its claims
// checked by `idTokenIdentity` (option 1 of V-S04: TLS back channel, no signature check). Facebook (`graph`): the code
// is exchanged with the client credentials in the form body (Facebook's documented shape, which `OAuth2Client`'s
// Basic header is not) and the PKCE verifier, then Graph `/me?fields=id,email` is read with the access token and its
// `appsecret_proof`; both calls go over TLS in the back channel, so the answer is the provider's own. Only the routes import this file — never `di.ts` or a
// command — so the ESM-only `arctic` stays out of the CLI.
import { CodeChallengeMethod, OAuth2Client, decodeIdToken, generateCodeVerifier } from 'arctic'
import { graphMeUrl } from '../lib/facebook'
import {
  IdentityProviderError,
  TOKEN_TIMEOUT_MS,
  accessTokenOf,
  graphIdentity,
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

async function graphJson(response: Response, stage: string): Promise<unknown> {
  if (!response.ok) throw new IdentityProviderError(`${stage}_${String(response.status)}`)
  return response.json()
}

/** Facebook: the code for an access token, then the Graph `/me` identity (null without a usable id). */
async function graphExchange(
  config: IdentityProviderConfig,
  userInfoUrl: string,
  code: string,
  verifier: string,
  signal: AbortSignal,
): Promise<ProviderIdentity | null> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: verifier,
  })
  const tokens = await graphJson(
    await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
      signal,
    }),
    'token',
  )
  const accessToken = accessTokenOf(tokens)
  if (!accessToken) throw new IdentityProviderError('token_without_access_token')
  const me = await graphJson(
    await fetch(graphMeUrl(userInfoUrl, accessToken, config.clientSecret), {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal,
    }),
    'userinfo',
  )
  return graphIdentity(me)
}

/**
 * Exchanges the code with the provider (5 s limit for the whole exchange) and returns the identity it names, or null
 * when a claim fails. Throws on a provider error, a timeout or a transport failure — the callback turns both into
 * `identity=failed`.
 */
export async function exchangeCode(
  config: IdentityProviderConfig,
  code: string,
  verifier: string,
): Promise<ProviderIdentity | null> {
  if (config.protocol === 'graph' && config.userInfoUrl) {
    const abort = new AbortController()
    try {
      return await withTimeout(graphExchange(config, config.userInfoUrl, code, verifier, abort.signal), TOKEN_TIMEOUT_MS)
    } finally {
      abort.abort()
    }
  }
  const tokens = await withTimeout(
    clientFor(config).validateAuthorizationCode(config.tokenUrl, code, verifier),
    TOKEN_TIMEOUT_MS,
  )
  return idTokenIdentity(decodeIdToken(tokens.idToken()), config, Date.now())
}
