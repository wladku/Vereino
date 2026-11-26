// Engineering standards S8.9, ENG-Q-11 (#744): the cross-site check `src/proxy.ts` applies to cookie-authenticated
// `/api` mutations.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  CROSS_SITE_REQUEST_ERROR_CODE,
  crossSiteApiVerdict,
  hasSessionCookie,
  isInstanceOrigin,
} from '../cross-site-request.ts'

const ENV = { APP_URL: 'https://app.vereino.org', VEREINO_CLUB_DOMAIN: 'vereino.org' }

/** A request on `orlik.vereino.org` carrying the staff session cookie; `headers` override or add (null removes). */
function request(headers = {}, overrides = {}) {
  const all = { host: 'orlik.vereino.org', cookie: 'locale=pl; auth_token=abc', ...headers }
  return {
    method: 'POST',
    pathname: '/api/club_core/settings',
    header: (name) => all[name] ?? null,
    env: ENV,
    ...overrides,
  }
}

const ALLOWED = { allowed: true }
const FOREIGN = { allowed: false, reason: 'foreign_origin' }
const CROSS_SITE = { allowed: false, reason: 'cross_site_fetch' }

describe('crossSiteApiVerdict', () => {
  test('exposes the error code the proxy answers with', () => {
    assert.equal(CROSS_SITE_REQUEST_ERROR_CODE, 'cross_site_request_refused')
  })

  test('refuses a cookie-authenticated mutation from a foreign origin, for every mutating method', () => {
    for (const method of ['POST', 'put', 'PATCH', 'DELETE']) {
      assert.deepEqual(crossSiteApiVerdict(request({ origin: 'https://evil.example' }, { method })), FOREIGN)
    }
  })

  test('refuses Sec-Fetch-Site: cross-site even without an Origin', () => {
    assert.deepEqual(crossSiteApiVerdict(request({ 'sec-fetch-site': ' Cross-Site ' })), CROSS_SITE)
    assert.deepEqual(
      crossSiteApiVerdict(request({ 'sec-fetch-site': 'cross-site', origin: 'https://orlik.vereino.org' })),
      CROSS_SITE,
    )
  })

  test('refuses an opaque, empty or non-http origin', () => {
    for (const origin of ['null', '', 'file:///etc/passwd']) {
      assert.deepEqual(crossSiteApiVerdict(request({ origin })), FOREIGN)
    }
  })

  test('allows the own origin, APP_URL, the bare club domain and a club subdomain', () => {
    for (const origin of [
      'https://orlik.vereino.org',
      'https://app.vereino.org',
      'https://vereino.org',
      'https://www.vereino.org',
      'https://sokol.vereino.org',
    ]) {
      assert.deepEqual(crossSiteApiVerdict(request({ origin, 'sec-fetch-site': 'same-site' })), ALLOWED, origin)
    }
  })

  test('refuses look-alike hosts of the club domain', () => {
    for (const origin of [
      'https://evilvereino.org',
      'https://vereino.org.evil.example',
      'https://a.b.vereino.org',
      'https://-x.vereino.org',
    ]) {
      assert.deepEqual(crossSiteApiVerdict(request({ origin })), FOREIGN, origin)
    }
  })

  test('allows a request without Origin and without Sec-Fetch-Site: cross-site (not a browser cross-site request)', () => {
    assert.deepEqual(crossSiteApiVerdict(request()), ALLOWED)
    assert.deepEqual(crossSiteApiVerdict(request({ 'sec-fetch-site': 'same-origin' })), ALLOWED)
    const undefinedHeaders = { ...request(), header: (name) => (name === 'cookie' ? 'auth_token=abc' : undefined) }
    assert.deepEqual(crossSiteApiVerdict(undefinedHeaders), ALLOWED)
  })

  test('leaves safe methods, non-API paths and webhook routes alone', () => {
    const foreign = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      assert.deepEqual(crossSiteApiVerdict(request(foreign, { method })), ALLOWED)
    }
    for (const pathname of ['/backend/settings', '/apiary', '/p/orlik']) {
      assert.deepEqual(crossSiteApiVerdict(request(foreign, { pathname })), ALLOWED, pathname)
    }
    for (const pathname of ['/api/payment_gateways/webhook/stripe', '/api/webhooks/inbound', '/api/x/webhooks']) {
      assert.deepEqual(crossSiteApiVerdict(request(foreign, { pathname })), ALLOWED, pathname)
    }
    for (const pathname of ['/api', '/api/club_core/webhookish', '/api/a/b/webhook/c']) {
      assert.deepEqual(crossSiteApiVerdict(request(foreign, { pathname })), CROSS_SITE, pathname)
    }
  })

  test('exempts bearer-token and API-key requests', () => {
    const foreign = { origin: 'https://evil.example' }
    for (const credentials of [
      { authorization: 'Bearer eyJ' },
      { authorization: 'ApiKey omk_1' },
      { 'x-api-key': 'omk_1' },
    ]) {
      assert.deepEqual(crossSiteApiVerdict(request({ ...foreign, ...credentials })), ALLOWED)
    }
    assert.deepEqual(crossSiteApiVerdict(request({ ...foreign, authorization: 'Basic x', 'x-api-key': ' ' })), FOREIGN)
  })

  test('leaves requests without a session cookie alone', () => {
    const foreign = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }
    assert.deepEqual(crossSiteApiVerdict(request({ ...foreign, cookie: 'locale=pl' })), ALLOWED)
    assert.deepEqual(crossSiteApiVerdict(request({ ...foreign, cookie: null })), ALLOWED)
  })
})

describe('hasSessionCookie', () => {
  test('finds each platform session cookie with a value', () => {
    for (const cookie of [
      'auth_token=a',
      'x=1; session_token=b',
      'customer_auth_token=c',
      'customer_session_token=d',
    ]) {
      assert.equal(hasSessionCookie(cookie), true, cookie)
    }
  })

  test('ignores empty values, look-alike names and a missing header', () => {
    assert.equal(hasSessionCookie('auth_token='), false)
    assert.equal(hasSessionCookie('auth_token=; x=1'), false)
    assert.equal(hasSessionCookie('my_auth_token=a'), false)
    assert.equal(hasSessionCookie(null), false)
    assert.equal(hasSessionCookie(undefined), false)
  })
})

describe('isInstanceOrigin', () => {
  const header = (values) => (name) => values[name] ?? null

  test('matches the request host and the first x-forwarded-host entry', () => {
    const env = {}
    assert.equal(isInstanceOrigin('http://klub.example', { header: header({ host: 'KLUB.example' }), env }), true)
    assert.equal(
      isInstanceOrigin('https://klub.example', {
        header: header({ host: 'internal:8080', 'x-forwarded-host': 'klub.example, proxy' }),
        env,
      }),
      true,
    )
    assert.equal(isInstanceOrigin('https://other.example', { header: header({ host: 'klub.example' }), env }), false)
  })

  test('without a club domain only the own host and APP_URL pass', () => {
    const env = { APP_URL: 'http://127.0.0.1:3000' }
    assert.equal(isInstanceOrigin('http://127.0.0.1:3000', { header: header({}), env }), true)
    assert.equal(isInstanceOrigin('http://orlik.vereino.org', { header: header({}), env }), false)
    assert.equal(isInstanceOrigin('http://127.0.0.1:3000', { header: header({}), env: { APP_URL: 'nope' } }), false)
  })

  test('a club domain with a port matches with the port; one without matches on any port', () => {
    const withPort = { VEREINO_CLUB_DOMAIN: 'localhost:3123' }
    assert.equal(isInstanceOrigin('http://orlik.localhost:3123', { header: header({}), env: withPort }), true)
    assert.equal(isInstanceOrigin('http://orlik.localhost:4000', { header: header({}), env: withPort }), false)
    const withoutPort = { VEREINO_CLUB_DOMAIN: 'vereino.test' }
    assert.equal(isInstanceOrigin('http://orlik.vereino.test:8443', { header: header({}), env: withoutPort }), true)
  })
})
