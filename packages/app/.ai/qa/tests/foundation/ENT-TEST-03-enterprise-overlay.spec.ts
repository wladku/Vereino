import { spawn, type ChildProcess } from 'node:child_process'
import { sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { APP_ROOT, createClub, type Club } from '../_fixtures/club'

// ENT-TEST-03 @enterprise-overlay, overlay shape (enterprise package spec DD-E03, DD-E07, DD-E11, REQ-E02, REQ-E04,
// REQ-E05; #713). Runs only in the CI job `enterprise-overlay`: the fixture package `@vereino/enterprise` overlaid with
// `scripts/enterprise-overlay.mjs --ci` and the build made with `NEXT_PUBLIC_VEREINO_ENTERPRISE=true`; the default
// (public) run skips it. Licence keys are read once at boot and must name tenants that exist, so the test creates three
// clubs on the runner's app and then starts a second server of the same build, on the same database, with keys signed
// by the committed test key pair (trusted only through `--ci` and `VEREINO_CI=true`): club A `on`, club B no key
// (`off`, 404 like an unknown route), club C an expired key past its grace period (`read_only`: reads work, the demo
// write is 409). The runner's own app has no keys, so there every club is `off`.
test.describe.configure({ timeout: 600_000 })

const OVERLAY = process.env.NEXT_PUBLIC_VEREINO_ENTERPRISE === 'true'
const KEY_PAIR = path.join(APP_ROOT, '.ai/qa/fixtures/licence-test-key-pair.json')
const PREFIX = 'vereino-lic.v1.'
const INSTANCE = 'qa-enterprise-overlay'
const STATE_URL = '/api/enterprise_demo/state'
const READY_TIMEOUT_MS = 240_000

type Licence = { lid: string; tenantId: string; issuedAt: string; expiresAt: string }

function testSignedKey(licence: Licence): string {
  const pair = JSON.parse(readFileSync(KEY_PAIR, 'utf8')) as { kid: string; privateKeyPem: string }
  const payload = { v: 1, kid: pair.kid, instance: INSTANCE, features: ['enterprise_demo'], graceDays: 14, ...licence }
  const payloadPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = sign(null, Buffer.from(`${PREFIX}${payloadPart}`, 'ascii'), pair.privateKeyPem)
  return `${PREFIX}${payloadPart}.${signature.toString('base64url')}`
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => {
        resolve(port)
      })
    })
  })
}

type LicensedServer = { baseUrl: string; child: ChildProcess; output: () => string }

/** `next start` of the runner's build with the given keys: the same `instrumentation.ts` boot as `yarn start`. */
async function startLicensedServer(keys: string[]): Promise<LicensedServer> {
  const port = await freePort()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    VEREINO_CI: 'true',
    VEREINO_INSTANCE_ID: INSTANCE,
    VEREINO_LICENCE_KEYS: keys.join('\n'),
    VEREINO_LICENCE_KEYS_FILE: '',
  }
  const child = spawn('yarn', ['next', 'start', '--port', String(port)], {
    cwd: APP_ROOT,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()))
  const baseUrl = `http://127.0.0.1:${String(port)}`
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`[internal] the licensed server exited:\n${output}`)
    const ready = await fetch(`${baseUrl}/login`).then(
      (response) => response.status === 200,
      () => false,
    )
    if (ready) return { baseUrl, child, output: () => output }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  stopServer(child)
  throw new Error(`[internal] the licensed server was not ready within ${String(READY_TIMEOUT_MS / 1000)}s:\n${output}`)
}

function stopServer(child: ChildProcess): void {
  try {
    if (child.pid) process.kill(-child.pid, 'SIGTERM')
  } catch {
    // the process group is already gone
  }
}

async function demo(
  request: APIRequestContext,
  baseUrl: string,
  method: 'GET' | 'POST',
  token: string,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const response = await request.fetch(`${baseUrl}${STATE_URL}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: method === 'POST' ? {} : undefined,
  })
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  return { status: response.status(), body }
}

async function grantDemo(request: APIRequestContext, club: Club): Promise<void> {
  await setRoleAclFeatures(request, club.superToken, {
    roleId: club.tenant.roleId,
    features: ['audit_logs.view_self', 'audit_logs.undo_self', 'enterprise_demo.view'],
  })
}

async function openDemoPage(page: Page, baseUrl: string, club: Club): Promise<void> {
  const login = await page.request.post(`${baseUrl}/api/auth/login`, {
    form: { email: club.tenant.email, password: club.tenant.password },
  })
  expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
  await page.goto(`${baseUrl}/backend/enterprise-demo`)
}

test('ENT-TEST-03 @enterprise-overlay: the demo feature is on for A, off for B and read-only for C', async ({
  page,
  request,
}) => {
  test.skip(!OVERLAY, 'overlay shape only: the CI job enterprise-overlay sets NEXT_PUBLIC_VEREINO_ENTERPRISE=true')
  const clubs: Club[] = []
  let server: LicensedServer | null = null
  try {
    const [a, b, c] = [
      await createClub(request, 'ent-a'),
      await createClub(request, 'ent-b'),
      await createClub(request, 'ent-c'),
    ]
    clubs.push(a, b, c)
    for (const club of clubs) await grantDemo(request, club)

    // The runner's app has no keys: the Enterprise module is registered, but every club is `off`.
    expect((await demo(request, process.env.BASE_URL ?? '', 'GET', a.adminToken)).status).toBe(404)

    const keys = [
      testSignedKey({
        lid: 'qa-ent-a',
        tenantId: a.tenant.tenantId,
        issuedAt: '2026-01-01T00:00:00Z',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
      testSignedKey({
        lid: 'qa-ent-c-expired',
        tenantId: c.tenant.tenantId,
        issuedAt: '2025-01-01T00:00:00Z',
        expiresAt: '2025-06-01T00:00:00Z',
      }),
    ]
    server = await startLicensedServer(keys)
    const { baseUrl } = server

    const readA = await demo(request, baseUrl, 'GET', a.adminToken)
    expect(readA.status, server.output()).toBe(200)
    expect(readA.body).toMatchObject({ state: 'on', renewalNotice: false })
    expect((await demo(request, baseUrl, 'POST', a.adminToken)).status).toBe(200)

    for (const method of ['GET', 'POST'] as const) {
      const off = await demo(request, baseUrl, method, b.adminToken)
      expect(off.status, `${method} as club B`).toBe(404)
      expect(off.body?.code).toBe('enterprise_feature_disabled')
    }

    const readC = await demo(request, baseUrl, 'GET', c.adminToken)
    expect(readC.status).toBe(200)
    expect(readC.body).toMatchObject({ state: 'read_only' })
    const writeC = await demo(request, baseUrl, 'POST', c.adminToken)
    expect(writeC.status).toBe(409)
    expect(writeC.body?.code).toBe('enterprise_feature_read_only')

    // The test kid is trusted only through the `--ci` trust file and VEREINO_CI=true, and never silently.
    expect(server.output()).toContain('trusting TEST licence kid')
    for (const key of keys) expect(server.output()).not.toContain(key)

    await openDemoPage(page, baseUrl, a)
    await expect(page.getByTestId('enterprise-demo-state')).toHaveAttribute('data-state', 'on')
    await expect(page.getByTestId('enterprise-demo-read-only')).toHaveCount(0)
    await page.goto('about:blank')
    await page.context().clearCookies()
    await openDemoPage(page, baseUrl, c)
    await expect(page.getByTestId('enterprise-demo-state')).toHaveAttribute('data-state', 'read_only')
    await expect(page.getByTestId('enterprise-demo-read-only')).toBeVisible()
  } finally {
    if (server) stopServer(server.child)
    for (const club of clubs) await club.cleanup()
  }
})
