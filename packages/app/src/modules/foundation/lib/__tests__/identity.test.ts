// Social sign-in rules (#566, Facebook #567; spec TEST-S01/S03 unit part, V-S04 option 1): provider configuration,
// id-token claims, the Graph `/me` answer, the state marker, the outcome paths, the last-method rule, the deletion
// status page and the token-endpoint timeout.
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import {
  DELETION_STATUS_PATH,
  FACEBOOK_AUTHORIZATION_URL,
  FACEBOOK_ME_URL,
  FACEBOOK_TOKEN_URL,
  GOOGLE_AUTHORIZATION_URL,
  GOOGLE_ISSUERS,
  GOOGLE_TOKEN_URL,
  IdentityProviderError,
  IdentityTimeoutError,
  accessTokenOf,
  deletionStatusUrl,
  graphIdentity,
  isConfirmationCode,
  STATE_TTL_MS,
  callbackPath,
  canRemoveMethod,
  idTokenIdentity,
  identityEventPayload,
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
  VEREINO_OAUTH_GOOGLE_CLIENT_SECRET: 'fake-secret',
}
const FACEBOOK_ENV = {
  VEREINO_OAUTH_FACEBOOK_CLIENT_ID: 'app-1',
  VEREINO_OAUTH_FACEBOOK_CLIENT_SECRET: 'fake-app-secret',
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
      protocol: 'oidc',
      clientId: 'client-1',
      clientSecret: 'fake-secret',
      authorizationUrl: GOOGLE_AUTHORIZATION_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      userInfoUrl: null,
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
    expect(
      identityProviderConfig('google', { ...GOOGLE_ENV, VEREINO_OAUTH_GOOGLE_CLIENT_ID: '  ' }, APP_URL),
    ).toBeNull()
    expect(identityProviderConfig('google', GOOGLE_ENV, null)).toBeNull()
    expect(identityProviderConfig('google', GOOGLE_ENV, 'not a url')).toBeNull()
    expect(identityProviderConfig('google', GOOGLE_ENV, 'ftp://club.example')).toBeNull()
    expect(
      identityProviderConfig(
        'google',
        { ...GOOGLE_ENV, VEREINO_OAUTH_GOOGLE_TOKEN_URL: 'javascript:alert(1)' },
        APP_URL,
      ),
    ).toBeNull()
  })

  it('accepts plain-HTTP provider endpoints on a loopback host only', () => {
    for (const host of ['localhost:6001', '[::1]:6001']) {
      expect(
        identityProviderConfig(
          'google',
          { ...GOOGLE_ENV, VEREINO_OAUTH_GOOGLE_TOKEN_URL: `http://${host}/token` },
          APP_URL,
        )?.tokenUrl,
      ).toBe(`http://${host}/token`)
    }
    expect(
      identityProviderConfig(
        'google',
        { ...GOOGLE_ENV, VEREINO_OAUTH_GOOGLE_TOKEN_URL: 'http://idp.example.com/token' },
        APP_URL,
      ),
    ).toBeNull()
    expect(
      identityProviderConfig(
        'google',
        { ...GOOGLE_ENV, VEREINO_OAUTH_GOOGLE_AUTHORIZATION_URL: 'http://idp.example.com/authorize' },
        APP_URL,
      ),
    ).toBeNull()
    expect(identityProviderConfig('google', GOOGLE_ENV, 'http://club.example')?.redirectUri).toBe(
      'http://club.example/api/foundation/identity/google/callback',
    )
  })

  it("returns Facebook's Graph endpoints when its app id and secret are configured", () => {
    expect(identityProviderConfig('facebook', FACEBOOK_ENV, APP_URL)).toEqual({
      id: 'facebook',
      protocol: 'graph',
      clientId: 'app-1',
      clientSecret: 'fake-app-secret',
      authorizationUrl: FACEBOOK_AUTHORIZATION_URL,
      tokenUrl: FACEBOOK_TOKEN_URL,
      userInfoUrl: FACEBOOK_ME_URL,
      redirectUri: 'https://club.example/api/foundation/identity/facebook/callback',
      issuers: [],
      scopes: ['email', 'public_profile'],
    })
    expect(FACEBOOK_AUTHORIZATION_URL).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.\d+\/dialog\/oauth$/)
  })

  it('takes the Facebook endpoint overrides of the test fake and is disabled without credentials or a usable me URL', () => {
    const config = identityProviderConfig(
      'facebook',
      {
        ...FACEBOOK_ENV,
        VEREINO_OAUTH_FACEBOOK_AUTHORIZATION_URL: 'http://127.0.0.1:6001/facebook/dialog/oauth',
        VEREINO_OAUTH_FACEBOOK_TOKEN_URL: 'http://127.0.0.1:6001/facebook/oauth/access_token',
        VEREINO_OAUTH_FACEBOOK_USERINFO_URL: 'http://127.0.0.1:6001/facebook/me',
      },
      APP_URL,
    )
    expect(config).toMatchObject({
      authorizationUrl: 'http://127.0.0.1:6001/facebook/dialog/oauth',
      tokenUrl: 'http://127.0.0.1:6001/facebook/oauth/access_token',
      userInfoUrl: 'http://127.0.0.1:6001/facebook/me',
    })
    expect(identityProviderConfig('facebook', { VEREINO_OAUTH_FACEBOOK_CLIENT_ID: 'app-1' }, APP_URL)).toBeNull()
    expect(identityProviderConfig('facebook', GOOGLE_ENV, APP_URL)).toBeNull()
    expect(
      identityProviderConfig(
        'facebook',
        { ...FACEBOOK_ENV, VEREINO_OAUTH_FACEBOOK_USERINFO_URL: 'http://graph.example.com/me' },
        APP_URL,
      ),
    ).toBeNull()
    // Google's variables never enable Facebook and the reverse.
    expect(identityProviderConfig('google', FACEBOOK_ENV, APP_URL)).toBeNull()
  })
})

describe('callbackPath', () => {
  it('names the provider callback route', () => {
    expect(callbackPath('google')).toBe('/api/foundation/identity/google/callback')
    expect(callbackPath('facebook')).toBe('/api/foundation/identity/facebook/callback')
  })
})

describe('accessTokenOf', () => {
  it('reads the access token of a token answer and nothing else', () => {
    expect(accessTokenOf({ access_token: 'tok', token_type: 'bearer' })).toBe('tok')
    expect(accessTokenOf({ access_token: '' })).toBeNull()
    expect(accessTokenOf({ access_token: 3 })).toBeNull()
    expect(accessTokenOf({})).toBeNull()
    expect(accessTokenOf(null)).toBeNull()
    expect(accessTokenOf('tok')).toBeNull()
  })
})

describe('graphIdentity', () => {
  it('returns the app-scoped id and the e-mail Facebook shares, or no e-mail', () => {
    expect(graphIdentity({ id: '1029384756', email: 'marta@example.com' })).toEqual({
      subject: '1029384756',
      email: 'marta@example.com',
    })
    expect(graphIdentity({ id: '1029384756' })).toEqual({ subject: '1029384756', email: null })
    expect(graphIdentity({ id: '1029384756', email: '' })).toEqual({ subject: '1029384756', email: null })
    expect(graphIdentity({ id: '1029384756', email: 7 })).toEqual({ subject: '1029384756', email: null })
  })

  it('refuses an answer without a usable id', () => {
    expect(graphIdentity(null)).toBeNull()
    expect(graphIdentity('x')).toBeNull()
    expect(graphIdentity({ email: 'marta@example.com' })).toBeNull()
    expect(graphIdentity({ id: 1029384756 })).toBeNull()
    expect(graphIdentity({ id: '' })).toBeNull()
    expect(graphIdentity({ id: 'x'.repeat(256) })).toBeNull()
  })
})

describe('deletion status', () => {
  it('recognises the 16-hex confirmation code of the deletion callback', () => {
    expect(isConfirmationCode('0123456789abcdef')).toBe(true)
    expect(isConfirmationCode('0123456789ABCDEF')).toBe(false)
    expect(isConfirmationCode('0123456789abcde')).toBe(false)
    expect(isConfirmationCode(['0123456789abcdef'])).toBe(false)
    expect(isConfirmationCode(undefined)).toBe(false)
  })

  it('puts the status page on the redirect base with the code', () => {
    expect(
      deletionStatusUrl('https://club.example/api/foundation/identity/facebook/callback', '0123456789abcdef'),
    ).toBe(`https://club.example${DELETION_STATUS_PATH}?code=0123456789abcdef`)
  })
})

describe('idTokenIdentity', () => {
  const now = Date.parse('2026-11-22T10:00:00Z')
  const exp = now / 1000 + 300
  const expected = { issuers: GOOGLE_ISSUERS, clientId: 'client-1' }
  const valid = {
    iss: 'https://accounts.google.com',
    aud: 'client-1',
    exp,
    sub: '1234',
    email: 'a@x.test',
    email_verified: true,
  }

  it('returns the subject and the verified e-mail of a valid token', () => {
    expect(idTokenIdentity(valid, expected, now)).toEqual({ subject: '1234', email: 'a@x.test' })
    expect(idTokenIdentity({ ...valid, iss: 'accounts.google.com' }, expected, now)).toEqual({
      subject: '1234',
      email: 'a@x.test',
    })
  })

  it('drops an unverified or missing e-mail but keeps the identity', () => {
    expect(idTokenIdentity({ ...valid, email_verified: false }, expected, now)).toEqual({
      subject: '1234',
      email: null,
    })
    expect(idTokenIdentity({ ...valid, email: undefined }, expected, now)).toEqual({ subject: '1234', email: null })
  })

  it('accepts several audiences only when our client is the authorized party', () => {
    expect(idTokenIdentity({ ...valid, aud: ['other', 'client-1'], azp: 'client-1' }, expected, now)?.subject).toBe(
      '1234',
    )
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
    expect(
      parseStateMarker({ ...link, purpose: { kind: 'link', userId: '', tenantId: 't', organizationId: 'o' } }),
    ).toBeNull()
    expect(
      parseStateMarker({ ...link, purpose: { kind: 'link', userId: 'u', tenantId: 1, organizationId: 'o' } }),
    ).toBeNull()
    expect(parseStateMarker({ ...signIn, verifier: '' })).toBeNull()
    expect(parseStateMarker({ ...signIn, redirect: 3 })).toBeNull()
    expect(parseStateMarker({ ...signIn, expiresAt: '10' })).toBeNull()
  })
})

describe('markerAccepted', () => {
  const marker: StateMarker = {
    provider: 'google',
    purpose: { kind: 'sign_in' },
    verifier: 'v',
    redirect: '/club',
    expiresAt: 100,
  }

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
    expect(profileOutcomePath('linked', 'facebook')).toBe('/club/profile?identity=linked&provider=facebook')
  })
})

describe('canRemoveMethod', () => {
  it('keeps the last sign-in method', () => {
    expect(canRemoveMethod(true, 1)).toBe(true)
    expect(canRemoveMethod(false, 2)).toBe(true)
    expect(canRemoveMethod(false, 1)).toBe(false)
  })
})

describe('IdentityProviderError', () => {
  it('names itself and keeps the short reason', () => {
    const error = new IdentityProviderError('token_400')
    expect(error.name).toBe('IdentityProviderError')
    expect(error.message).toBe('token_400')
  })
})

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('passes a timely result and a timely failure through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok')
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
    // A non-Error rejection (a thenable that rejects with a string) is wrapped in an Error.
    const plain = {
      then(_resolve: (value: string) => void, fail: (reason: unknown) => void) {
        fail('plain')
      },
    } as unknown as Promise<string>
    await expect(withTimeout(plain, 50)).rejects.toThrow('plain')
  })

  it('fails with IdentityTimeoutError when the promise is slower than the limit', async () => {
    jest.useFakeTimers()
    const pending = withTimeout(new Promise<string>(() => undefined), 5000)
    jest.advanceTimersByTime(5000)
    await expect(pending).rejects.toBeInstanceOf(IdentityTimeoutError)
  })
})

describe('identityEventPayload', () => {
  it('keeps ids and the provider and drops the subject and the e-mail', () => {
    const link = {
      id: 'l',
      userId: 'u',
      provider: 'google' as const,
      tenantId: 't',
      organizationId: 'o',
      subject: '1234',
      emailAtLink: 'a@x.test',
    }
    expect(identityEventPayload(link)).toEqual({
      id: 'l',
      userId: 'u',
      provider: 'google',
      tenantId: 't',
      organizationId: 'o',
    })
  })
})
