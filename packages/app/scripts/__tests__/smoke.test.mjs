// Unit tests for the post-deploy smoke check `scripts/smoke.mjs` (engineering standards S14.5; issue #462).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkHealth,
  checkNoStore,
  checkSignInPage,
  normalizeBaseUrl,
  runChecks,
  runCli,
  SECURITY_HEADERS,
} from '../../../../scripts/smoke.mjs'

const BASE = 'https://vereino.example'
const SECURE = Object.fromEntries(SECURITY_HEADERS.map((header) => [header, 'x']))

function html(status = 200, headers = SECURE) {
  return new Response('<html></html>', { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } })
}

/** A fetch answering by path; a function value is called with the request init. */
function fakeFetch(routes) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const pathname = new URL(url).pathname
    calls.push({ pathname, init })
    const route = routes[pathname]
    if (route instanceof Error) throw route
    if (typeof route === 'function') return route(init)
    if (route) return route
    return new Response('not found', { status: 404 })
  }
  return { fetchImpl, calls }
}

const healthy = () => new Response('{}', { status: 200 })
const tokenResponse = () => new Response(JSON.stringify({ token: 'tok-123' }), { status: 200 })
const profile = (cacheControl) => () =>
  new Response('{}', { status: 200, headers: cacheControl ? { 'cache-control': cacheControl } : {} })

test('normalizeBaseUrl accepts http(s) URLs and strips trailing slashes', () => {
  assert.equal(normalizeBaseUrl('https://vereino.example///'), BASE)
  assert.equal(normalizeBaseUrl('http://127.0.0.1:5001'), 'http://127.0.0.1:5001')
  assert.equal(normalizeBaseUrl('vereino.example'), null)
  assert.equal(normalizeBaseUrl(undefined), null)
})

test('checkHealth passes on 2xx, fails on another status and on a network error', async () => {
  assert.equal(
    (await checkHealth({ baseUrl: BASE, fetchImpl: fakeFetch({ '/api/healthz': healthy() }).fetchImpl })).status,
    'pass',
  )
  const down = await checkHealth({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/healthz': new Response('', { status: 503 }) }).fetchImpl,
  })
  assert.deepEqual(down, { name: 'health', status: 'fail', detail: 'GET /api/healthz answered 503' })
  const refused = await checkHealth({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/healthz': new Error('ECONNREFUSED') }).fetchImpl,
  })
  assert.equal(refused.detail, 'GET /api/healthz failed: ECONNREFUSED')
})

test('checkHealth sends a manual-redirect request with a timeout', async () => {
  const { fetchImpl, calls } = fakeFetch({ '/api/healthz': healthy() })
  await checkHealth({ baseUrl: BASE, fetchImpl })
  assert.equal(calls[0].init.redirect, 'manual')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test('checkSignInPage passes on an HTML page with every security header', async () => {
  const results = await checkSignInPage({ baseUrl: BASE, fetchImpl: fakeFetch({ '/login': html() }).fetchImpl })
  assert.deepEqual(
    results.map((result) => result.status),
    ['pass', 'pass'],
  )
})

test('checkSignInPage names a wrong page and every missing header', async () => {
  const redirect = new Response(null, { status: 307, headers: { 'x-frame-options': 'SAMEORIGIN' } })
  const [page, headers] = await checkSignInPage({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/login': redirect }).fetchImpl,
  })
  assert.deepEqual(page, { name: 'sign-in page', status: 'fail', detail: 'GET /login answered 307 (no content type)' })
  const [plain] = await checkSignInPage({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/login': new Response('x', { status: 200, headers: { 'content-type': 'text/plain' } }) })
      .fetchImpl,
  })
  assert.equal(plain.detail, 'GET /login answered 200 (text/plain)')
  assert.deepEqual(headers, {
    name: 'security headers',
    status: 'fail',
    detail: 'missing: content-security-policy, referrer-policy, x-content-type-options',
  })
})

test('checkSignInPage fails both checks on a network error', async () => {
  const results = await checkSignInPage({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/login': new Error('timeout') }).fetchImpl,
  })
  assert.deepEqual(
    results.map((result) => [result.status, result.detail]),
    [
      ['fail', 'GET /login failed: timeout'],
      ['fail', 'GET /login failed: timeout'],
    ],
  )
})

test('checkNoStore is skipped without the smoke account', async () => {
  const result = await checkNoStore({ baseUrl: BASE, fetchImpl: fakeFetch({}).fetchImpl, email: 'a@b.c' })
  assert.equal(result.status, 'skip')
})

test('checkNoStore signs in, sends the token and passes on no-store', async () => {
  const { fetchImpl, calls } = fakeFetch({
    '/api/auth/login': tokenResponse,
    '/api/auth/profile': profile('private, no-store'),
  })
  const result = await checkNoStore({ baseUrl: BASE, fetchImpl, email: 'smoke@vereino.example', password: 'pw' })
  assert.deepEqual(result, { name: 'no-store', status: 'pass', detail: 'Cache-Control: private, no-store' })
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.body, 'email=smoke%40vereino.example&password=pw')
  assert.equal(calls[1].init.headers.authorization, 'Bearer tok-123')
})

test('checkNoStore fails without no-store and never prints the token', async () => {
  const cached = await checkNoStore({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/auth/login': tokenResponse, '/api/auth/profile': profile('max-age=60') }).fetchImpl,
    email: 'e',
    password: 'p',
  })
  assert.deepEqual(cached, {
    name: 'no-store',
    status: 'fail',
    detail: 'GET /api/auth/profile Cache-Control: max-age=60',
  })
  const none = await checkNoStore({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/auth/login': tokenResponse, '/api/auth/profile': profile(null) }).fetchImpl,
    email: 'e',
    password: 'p',
  })
  assert.equal(none.detail, 'GET /api/auth/profile Cache-Control: (none)')
  assert.ok(!none.detail.includes('tok-123'))
})

test('checkNoStore fails when the profile request is refused', async () => {
  const result = await checkNoStore({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/auth/login': tokenResponse, '/api/auth/profile': new Response('', { status: 401 }) })
      .fetchImpl,
    email: 'e',
    password: 'p',
  })
  assert.equal(result.detail, 'GET /api/auth/profile answered 401')
})

test('checkNoStore fails when the sign-in gives no token', async () => {
  const rejected = await checkNoStore({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/auth/login': new Response('{}', { status: 401 }) }).fetchImpl,
    email: 'e',
    password: 'p',
  })
  assert.equal(rejected.detail, 'sign-in as the smoke account failed (POST /api/auth/login 401)')
  const notJson = await checkNoStore({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/auth/login': () => new Response('<html>', { status: 200 }) }).fetchImpl,
    email: 'e',
    password: 'p',
  })
  assert.equal(notJson.status, 'fail')
  const emptyToken = await checkNoStore({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/auth/login': () => new Response('{"token":""}', { status: 200 }) }).fetchImpl,
    email: 'e',
    password: 'p',
  })
  assert.equal(emptyToken.status, 'fail')
})

test('checkNoStore fails on a network error and on a non-Error rejection', async () => {
  const failing = await checkNoStore({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/auth/login': new Error('reset') }).fetchImpl,
    email: 'e',
    password: 'p',
  })
  assert.equal(failing.detail, 'authenticated request failed: reset')
  const odd = await checkNoStore({
    baseUrl: BASE,
    fetchImpl: async () => {
      throw 'boom'
    },
    email: 'e',
    password: 'p',
  })
  assert.equal(odd.detail, 'authenticated request failed: boom')
})

test('runChecks runs every check in order', async () => {
  const results = await runChecks({
    baseUrl: BASE,
    fetchImpl: fakeFetch({ '/api/healthz': healthy(), '/login': html() }).fetchImpl,
  })
  assert.deepEqual(
    results.map((result) => `${result.name}:${result.status}`),
    ['health:pass', 'sign-in page:pass', 'security headers:pass', 'no-store:skip'],
  )
})

test('runCli exits 0 and reports each check when everything passes', async () => {
  const lines = []
  const code = await runCli({
    argv: [`${BASE}/`],
    env: { VEREINO_SMOKE_EMAIL: 'e', VEREINO_SMOKE_PASSWORD: 'secret-pw' },
    fetchImpl: fakeFetch({
      '/api/healthz': healthy(),
      '/login': html(),
      '/api/auth/login': tokenResponse,
      '/api/auth/profile': profile('no-store'),
    }).fetchImpl,
    log: (line) => lines.push(line),
    error: (line) => lines.push(line),
  })
  assert.equal(code, 0)
  assert.equal(lines.length, 6)
  assert.equal(lines.at(-1), 'smoke: passed')
  assert.ok(!lines.join('\n').includes('secret-pw'))
})

test('runCli exits 1 naming the failed checks', async () => {
  const errors = []
  const code = await runCli({
    argv: [BASE],
    env: {},
    fetchImpl: fakeFetch({ '/login': html(200, {}) }).fetchImpl,
    log: () => {},
    error: (line) => errors.push(line),
  })
  assert.equal(code, 1)
  assert.deepEqual(errors, ['smoke: failed: health, security headers'])
})

test('runCli exits 2 without a base URL', async () => {
  const errors = []
  assert.equal(
    await runCli({
      argv: [],
      env: {},
      fetchImpl: fakeFetch({}).fetchImpl,
      log: () => {},
      error: (line) => errors.push(line),
    }),
    2,
  )
  assert.match(errors[0], /^usage:/)
})

test('runCli defaults to process arguments, the environment, fetch and the console', async (t) => {
  t.mock.method(console, 'error', () => {})
  const saved = process.argv
  t.after(() => {
    process.argv = saved
  })
  process.argv = ['node', 'smoke.mjs']
  assert.equal(await runCli(), 2)
})

test('runCli logs to the console by default', async (t) => {
  const logged = t.mock.method(console, 'log', () => {})
  t.mock.method(console, 'error', () => {})
  const savedFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = savedFetch
  })
  globalThis.fetch = fakeFetch({ '/api/healthz': healthy(), '/login': html() }).fetchImpl
  assert.equal(await runCli({ argv: [BASE], env: {} }), 0)
  assert.ok(logged.mock.callCount() > 0)
})
