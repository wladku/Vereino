import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createIsolatedTenant } from '../_fixtures/tenant'

// ENG-TEST-11 (engineering standards spec, phase E4, S8.4; issue #463), locally on the runner's production build:
// pages carry HSTS, Permissions-Policy and the decided CSP (no `'unsafe-eval'`), authenticated API responses are
// `no-store` while anonymous public JSON keeps its shared caching, `scripts/smoke.mjs` passes every check with a smoke
// account, and the admin UI runs under the stricter CSP without a violation.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..')
const HSTS = 'max-age=63072000; includeSubDomains'
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), browsing-topics=()'

async function runSmoke(
  baseUrl: string,
  env: Record<string, string>,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', ['./scripts/smoke.mjs', baseUrl], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.on('exit', (code) => {
      resolve({ code, output })
    })
  })
}

/** Records every CSP violation the page reports, from the first script on. */
async function recordCspViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const store: string[] = []
    ;(window as unknown as { __cspViolations: string[] }).__cspViolations = store
    document.addEventListener('securitypolicyviolation', (event) => {
      store.push(`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${String(event.lineNumber)}`)
    })
  })
  const console: string[] = []
  page.on('console', (message) => {
    if (/Content[- ]Security[- ]Policy|unsafe-eval/i.test(message.text())) console.push(message.text())
  })
  return async () => [
    ...(await page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])),
    ...console,
  ]
}

test('ENG-TEST-11 pages carry HSTS, Permissions-Policy and a CSP without unsafe-eval', async ({ request }) => {
  const token = await getAuthToken(request, 'superadmin')
  for (const [pathname, cookie] of [
    ['/login', ''],
    ['/backend', `auth_token=${token}`],
  ]) {
    const response = await request.get(pathname, { maxRedirects: 0, headers: { cookie } })
    expect(response.status(), pathname).toBe(200)
    const headers = response.headers()
    expect(headers['strict-transport-security'], pathname).toBe(HSTS)
    expect(headers['permissions-policy'], pathname).toBe(PERMISSIONS_POLICY)
    const csp = headers['content-security-policy'] ?? ''
    expect(csp, pathname).toContain("script-src 'self' 'unsafe-inline' https://js.stripe.com")
    expect(csp, pathname).not.toContain('unsafe-eval')
    expect(headers['x-content-type-options'], pathname).toBe('nosniff')
    expect(headers['x-frame-options'], pathname).toBe('SAMEORIGIN')
    expect(headers['referrer-policy'], pathname).toBe('strict-origin-when-cross-origin')
  }
})

test('ENG-TEST-11 authenticated API responses are no-store, anonymous ones are not forced', async ({ request }) => {
  const token = await getAuthToken(request, 'superadmin')
  const bearer = await request.get('/api/auth/profile', { headers: { authorization: `Bearer ${token}` } })
  expect(bearer.status()).toBe(200)
  expect(bearer.headers()['cache-control']).toContain('no-store')

  const cookie = await request.get('/api/auth/profile', { headers: { cookie: `auth_token=${token}` } })
  expect(cookie.status()).toBe(200)
  expect(cookie.headers()['cache-control']).toContain('no-store')

  // The health route answers anonymous callers; the config adds no Cache-Control of its own there.
  const anonymous = await request.get('/api/healthz', { headers: { cookie: '' } })
  expect(anonymous.ok()).toBe(true)
  expect(anonymous.headers()['cache-control'] ?? '').not.toContain('private, no-store')
})

test('ENG-TEST-11 the post-deploy smoke check passes every check with a smoke account', async ({
  request,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const tenant = await createIsolatedTenant(request, 'eng-test-11')
  try {
    const { code, output } = await runSmoke(baseURL ?? '', {
      VEREINO_SMOKE_EMAIL: tenant.email,
      VEREINO_SMOKE_PASSWORD: tenant.password,
    })
    expect(code, output).toBe(0)
    for (const check of ['health', 'sign-in page', 'security headers', 'no-store']) {
      expect(output).toContain(`PASS ${check}`)
    }
    expect(output).not.toContain(tenant.password)
  } finally {
    await tenant.cleanup()
  }
})

test('ENG-TEST-11 the sign-in page and the admin UI run under the stricter CSP without a violation', async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000)
  const violations = await recordCspViolations(page)
  await page.goto('/login')
  await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
  expect(await violations()).toEqual([])

  const token = await getAuthToken(request, 'superadmin')
  await page.context().addCookies([{ name: 'auth_token', value: token, url: baseURL ?? '' }])
  for (const pathname of ['/backend', '/backend/people/persons/create', '/backend/activities/occurrences']) {
    const response = await page.goto(pathname)
    expect(response?.status(), pathname).toBeLessThan(400)
    await page.waitForLoadState('networkidle')
    expect(await violations(), pathname).toEqual([])
  }
})
