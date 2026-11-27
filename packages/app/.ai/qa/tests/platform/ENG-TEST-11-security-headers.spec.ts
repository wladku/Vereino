import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { publicGet, publish } from '../_fixtures/publication'
import { createIsolatedTenant } from '../_fixtures/tenant'

// ENG-TEST-11 (engineering standards spec, phase E4, S8.4; issue #463), locally on the runner's production build:
// pages carry HSTS, Permissions-Policy and the decided CSP (no `'unsafe-eval'`; since Open Mercato 0.10.1, #498, the
// platform's per-request nonce instead of `'unsafe-inline'` for scripts), authenticated API responses are
// `no-store` while anonymous public JSON keeps its shared caching (S8.6, a public club route; #557), `scripts/smoke.mjs` passes every check with a smoke
// account, and the admin UI runs under the stricter CSP without a violation.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..')
const HSTS = 'max-age=63072000; includeSubDomains'
const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), browsing-topics=()'

/** One directive of a CSP header (`script-src …`), or '' when the policy has none. */
function directive(csp: string, name: string): string {
  return (
    csp
      .split(';')
      .map((part) => part.trim())
      .find((part) => part === name || part.startsWith(`${name} `)) ?? ''
  )
}

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
  const nonces = new Set<string>()
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
    // The platform policy (Open Mercato 0.10.1, #498): scripts only from the app, this response's nonce and Stripe.
    const scriptSrc = directive(csp, 'script-src')
    expect(scriptSrc, pathname).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/]+={0,2}' https:\/\/js\.stripe\.com/)
    expect(scriptSrc, pathname).not.toContain("'unsafe-inline'")
    expect(directive(csp, 'script-src-attr'), pathname).toBe("script-src-attr 'none'")
    expect(directive(csp, 'connect-src').split(' '), pathname).not.toContain('https:')
    expect(csp, pathname).not.toContain('unsafe-eval')
    // Inline <style> elements: the nonce, plus the one fixed stylesheet of the Radix select viewport by its hash.
    const styleSrc = directive(csp, 'style-src')
    expect(styleSrc, pathname).toMatch(
      /^style-src 'self' 'nonce-[A-Za-z0-9+/]+={0,2}' 'sha256-441zG27rExd4\/il\+NvIqyL8zFx5XmyNQtE381kSkUJk='$/,
    )
    nonces.add(/'nonce-([^']+)'/.exec(scriptSrc)?.[1] ?? '')
    expect(headers['x-content-type-options'], pathname).toBe('nosniff')
    expect(headers['x-frame-options'], pathname).toBe('SAMEORIGIN')
    expect(headers['referrer-policy'], pathname).toBe('strict-origin-when-cross-origin')
  }
  // Every response gets its own nonce.
  expect(nonces.size).toBe(2)
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

test('ENG-TEST-11 a sessionless public club JSON route keeps public s-maxage=60 for anonymous callers (S8.6)', async ({
  request,
}) => {
  const club = await createClub(request, 'eng-test-11-public')
  try {
    const slug = `e11-${uniqueSuffix()}`
    await publish(request, club.adminToken, slug, ['contact'], { shortName: 'Klub E11' })
    const route = `/api/club_core/public/${slug}`

    // No cookie, no bearer token, no API key: the route's own shared caching survives the config's S8.4 header.
    const anonymous = await publicGet(request, route)
    expect(anonymous.status, JSON.stringify(anonymous.body)).toBe(200)
    const cacheControl = anonymous.headers['cache-control'] ?? ''
    expect(cacheControl).toContain('public')
    expect(cacheControl).toContain('s-maxage=60')
    expect(cacheControl).not.toContain('no-store')

    // The same route with a session cookie is the safe side: `private, no-store`.
    const signedIn = await request.get(route, { headers: { cookie: `auth_token=${club.adminToken}` } })
    expect(signedIn.status()).toBe(200)
    expect(signedIn.headers()['cache-control']).toContain('no-store')
  } finally {
    await club.cleanup()
  }
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
