// Social sign-in rules (#566; spec TEST-S01 unit part, V-S04 option 1): provider configuration, id-token claims, the
// state marker, the outcome paths, the last-method rule and the token-endpoint timeout.
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import {
  GOOGLE_AUTHORIZATION_URL,
  GOOGLE_ISSUERS,
  GOOGLE_TOKEN_URL,
  IdentityTimeoutError,
  STATE_TTL_MS,
  callbackPath,
  canRemoveMethod,
  idTokenIdentity,
  identityProviderConfig,
  isIdentityProvider,
  isWellFormedState,
  loginOutcomePath,
  markerAccepted,
  parseStateMarker,
  profileOutcomePath,
  stateMarkerKey,
  withTimeout,
  type StateMarker,
} from '../identity'

const GOOGLE_ENV = {
  VEREINO_OAUTH_GOOGLE_CLIENT_ID: 'client-1',
  VEREINO_OAUTH_GOOGLE_CLIENT_SECRET: 'secret-1',
}
const APP_URL = 'https://club.example'

describe('isIdentityProvider', () => {
  it('accepts the providers of the table and nothing else', () => {
    expect(isIdentityProvider('google')).toBe(true)
    expect(isIdentityProvider('facebook')).toBe(true)
    expect(isIdentityProvider('apple')).toBe(false)
    expect(isIdentityProvider(3)).toBe(false)
  })
})

describe('identityProviderConfig', () => {
  it("returns Google's endpoints and the callback on the app URL when only the client is configured", () => {
    expect(identityProviderConfig('google', GOOGLE_ENV, APP_URL)).toEqual({
      id: 'google',
      clientId: 'client-1',
      clientSecret: 'secret-1',
      authorizationUrl: GOOGLE_AUTHORIZATION_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      redirectUri: 'https://club.example/api/foundation/identity/google/callback',
      issuers: GOOGLE_ISSUERS,
      scopes: ['openid', 'email'],
    })
  })

  it('prefers the redirect base and the endpoint overrides of the test fake, trimming a trailing slash', () => {
    const config = identityProviderConfig(
      'google',
      {
        ...GOOGLE_ENV,
        VEREINO_OAUTH_REDIRECT_BASE_URL: 'http://127.0.0.1:5001/',
        VEREINO_OAUTH_GOOGLE_AUTHORIZATION_URL: ' http://127.0.0.1:6001/authorize ',
        VEREINO_OAUTH_GOOGLE_TOKEN_URL: 'http://127.0.0.1:6001/token',
      },
      APP_URL,
    )
    expect(config?.redirectUri).toBe('http://127.0.0.1:5001/api/foundation/identity/google/callback')
    expect(config?.authorizationUrl).toBe('http://127.0.0.1:6001/authorize')
    expect(config?.tokenUrl).toBe('http://127.0.0.1:6001/token')
  })

  it('is disabled without a client id, without a secret, without a usable base or with a broken endpoint', () => {
    expect(identityProviderConfig('google', { VEREINO_OAUTH_GOOGLE_CLIENT_ID: 'c' }, APP_URL)).toBeNull()
    expect(identityProviderConfig('google', { VEREINO_OAUTH_GOOGLE_CLIENT_SECRET: 's' }, APP_URL)).toBeNull()
    expect(identityProviderConfig('google', { ...GOOGLE_ENV, VEREINO_OAUTH_GOOGLE_CLIENT_ID: '  ' }, APP_URL)).toBeNull()
    expect(identityProviderConfig('google', GOOGLE_ENV, null)).toBeNull()
    expect(identityProviderConfig('google', GOOGLE_ENV, 'not a url')).toBeNull()
    expect(identityProviderConfig('google', GOOGLE_ENV, 'ftp://club.example')).toBeNull()
    expect(
      identityProviderConfig('google', { ...GOOGLE_ENV, VEREINO_OAUTH_GOOGLE_TOKEN_URL: 'javascript:alert(1)' }, APP_URL),
    ).toBeNull()
  })

  it('ships no Facebook configuration in phase 1', () => {
    expect(
      identityProviderConfig(
        'facebook',
        { VEREINO_OAUTH_FACEBOOK_CLIENT_ID: 'f', VEREINO_OAUTH_FACEBOOK_CLIENT_SECRET: 's' },
        APP_URL,
      ),
    ).toBeNull()
  })
})

describe('callbackPath', () => {
  it('names the provider callback route', () => {
    expect(callbackPath('google')).toBe('/api/foundation/identity/google/callback')
  })
})

describe('idTokenIdentity', () => {
  const now = Date.parse('2026-11-22T10:00:00Z')
  const exp = now / 1000 + 300
  const expected = { issuers: GOOGLE_ISSUERS, clientId: 'client-1' }
  const valid = { iss: 'https://accounts.google.com', aud: 'client-1', exp, sub: '1234', email: 'a@x.test', email_verified: true }

  it('returns the subject and the verified e-mail of a valid token', () => {
    expect(idTokenIdentity(valid, expected, now)).toEqual({ subject: '1234', email: 'a@x.test' })
    expect(idTokenIdentity({ ...valid, iss: 'accounts.google.com' }, expected, now)).toEqual({
      subject: '1234',
      email: 'a@x.test',
    })
  })

  it('drops an unverified or missing e-mail but keeps the identity', () => {
    expect(idTokenIdentity({ ...valid, email_verified: false }, expected, now)).toEqual({ subject: '1234', email: null })
    expect(idTokenIdentity({ ...valid, email: undefined }, expected, now)).toEqual({ subject: '1234', email: null })
  })

  it('accepts several audiences only when our client is the authorized party', () => {
    expect(idTokenIdentity({ ...valid, aud: ['other', 'client-1'], azp: 'client-1' }, expected, now)?.subject).toBe('1234')
    expect(idTokenIdentity({ ...valid, aud: ['other', 'client-1'], azp: 'other' }, expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, aud: ['client-1'] }, expected, now)?.subject).toBe('1234')
  })

  it('refuses a payload that is not an object, a foreign issuer, a foreign audience, an expired token and a bad subject', () => {
    expect(idTokenIdentity(null, expected, now)).toBeNull()
    expect(idTokenIdentity('token', expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, iss: 'https://evil.example' }, expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, iss: 7 }, expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, aud: 'other' }, expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, exp: now / 1000 }, expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, exp: String(exp) }, expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, sub: '' }, expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, sub: 42 }, expected, now)).toBeNull()
    expect(idTokenIdentity({ ...valid, sub: 'x'.repeat(256) }, expected, now)).toBeNull()
  })
})

describe('state helpers', () => {
  it('recognises the 43-character base64url state of 32 random bytes', () => {
    expect(isWellFormedState('A'.repeat(42) + '_')).toBe(true)
    expect(isWellFormedState('A'.repeat(42))).toBe(false)
    expect(isWellFormedState('A'.repeat(42) + '=')).toBe(false)
    expect(isWellFormedState(undefined)).toBe(false)
  })

  it('keys the marker by the state', () => {
    expect(stateMarkerKey('abc')).toBe('foundation:identity:state:abc')
  })

  it('lives ten minutes', () => {
    expect(STATE_TTL_MS).toBe(600_000)
  })
})

describe('parseStateMarker', () => {
  const signIn: StateMarker = {
    provider: 'google',
    purpose: { kind: 'sign_in' },
    verifier: 'v',
    redirect: '/club',
    expiresAt: 10,
  }
  const link: StateMarker = {
    ...signIn,
    purpose: { kind: 'link', userId: 'u', tenantId: 't', organizationId: 'o' },
  }

  it('reads back what start stored, as JSON text or as an object', () => {
    expect(parseStateMarker(JSON.stringify(signIn))).toEqual(signIn)
    expect(parseStateMarker(link)).toEqual(link)
  })

  it('refuses anything else', () => {
    expect(parseStateMarker('{not json')).toBeNull()
    expect(parseStateMarker(null)).toBeNull()
    expect(parseStateMarker(5)).toBeNull()
    expect(parseStateMarker({ ...signIn, provider: 'apple' })).toBeNull()
    expect(parseStateMarker({ ...signIn, purpose: null })).toBeNull()
    expect(parseStateMarker({ ...signIn, purpose: { kind: 'other' } })).toBeNull()
    expect(parseStateMarker({ ...link, purpose: { kind: 'link', userId: 'u', tenantId: 't' } })).toBeNull()
    expect(parseStateMarker({ ...link, purpose: { kind: 'link', userId: '', tenantId: 't', organizationId: 'o' } })).toBeNull()
    expect(parseStateMarker({ ...link, purpose: { kind: 'link', userId: 'u', tenantId: 1, organizationId: 'o' } })).toBeNull()
    expect(parseStateMarker({ ...signIn, verifier: '' })).toBeNull()
    expect(parseStateMarker({ ...signIn, redirect: 3 })).toBeNull()
    expect(parseStateMarker({ ...signIn, expiresAt: '10' })).toBeNull()
  })
})

describe('markerAccepted', () => {
  const marker: StateMarker = { provider: 'google', purpose: { kind: 'sign_in' }, verifier: 'v', redirect: '/club', expiresAt: 100 }

  it('accepts its own provider before the expiry only', () => {
    expect(markerAccepted(marker, 'google', 99)).toBe(true)
    expect(markerAccepted(marker, 'google', 100)).toBe(false)
    expect(markerAccepted(marker, 'facebook', 50)).toBe(false)
  })
})

describe('outcome paths', () => {
  it('sends every sign-in failure to /login with its outcome and a link round trip back to the profile', () => {
    expect(loginOutcomePath('unlinked')).toBe('/login?identity=unlinked')
    expect(loginOutcomePath('invalid')).toBe('/login?identity=invalid')
    expect(loginOutcomePath('failed')).toBe('/login?identity=failed')
    expect(profileOutcomePath('linked', 'google')).toBe('/club/profile?identity=linked&provider=google')
    expect(profileOutcomePath('failed', 'google')).toBe('/club/profile?identity=failed&provider=google')
  })
})

describe('canRemoveMethod', () => {
  it('keeps the last sign-in method', () => {
    expect(canRemoveMethod(true, 1)).toBe(true)
    expect(canRemoveMethod(false, 2)).toBe(true)
    expect(canRemoveMethod(false, 1)).toBe(false)
  })
})

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('passes a timely result and a timely failure through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
  })

  it('fails with IdentityTimeoutError when the promise is slower than the limit', async () => {
    jest.useFakeTimers()
    const pending = withTimeout(new Promise<string>(() => undefined), 5000)
    jest.advanceTimersByTime(5000)
    await expect(pending).rejects.toBeInstanceOf(IdentityTimeoutError)
  })
})
