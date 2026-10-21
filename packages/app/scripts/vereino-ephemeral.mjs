// Ephemeral app for integration and agent-browser tests (engineering standards S2.2, S13.1, ADR-003).
// The platform runner (`yarn test:integration:ephemeral`) only reports ready when the `customers` module
// answers, which this app does not enable, so Vereino runs its own thin runner on the same pieces:
// a Testcontainers PostgreSQL, `yarn initialize`, a production build and `yarn start`.
// Usage: node scripts/vereino-ephemeral.mjs test [--filter <text>] [--no-build] [--port <n>]
//        node scripts/vereino-ephemeral.mjs start [--no-build] [--port <n>]   (runs until Ctrl+C)
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ROOT } from './vereino-paths.mjs'

export const DEFAULT_POSTGRES_IMAGE = 'pgvector/pgvector:pg17-trixie'
export const DEFAULT_PORT = 5001
// Accounts seeded by `yarn initialize` for tests; the passwords are pinned below (test-only).
export const SEEDED_ADMIN = { email: 'admin@acme.com', password: 'secret' }
export const POSTGRES_INIT_SQL = [
  'CREATE EXTENSION IF NOT EXISTS vector;',
  'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
  '\\connect template1',
  'CREATE EXTENSION IF NOT EXISTS vector;',
  'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
  '',
].join('\n')
const PLAYWRIGHT_CONFIG = '.ai/qa/tests/playwright.config.ts'

export function parseArgs(argv) {
  const [mode, ...rest] = argv
  if (mode !== 'test' && mode !== 'start') throw new Error('usage: vereino-ephemeral.mjs <test|start> [options]')
  const options = { mode, filter: null, build: true, port: DEFAULT_PORT }
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index]
    if (argument === '--no-build') options.build = false
    else if (argument === '--filter' && rest[index + 1]) options.filter = rest[(index += 1)]
    else if (argument === '--port' && /^\d+$/.test(rest[index + 1] ?? '')) options.port = Number(rest[(index += 1)])
    else throw new Error(`unknown or incomplete option: ${argument}`)
  }
  return options
}

// Environment of the ephemeral app: test-only values, never real secrets.
export function buildAppEnv({
  databaseUrl,
  port,
  stateDir,
  baseEnv = process.env,
  secret = randomBytes(32).toString('hex'),
}) {
  const baseUrl = `http://127.0.0.1:${String(port)}`
  return {
    ...baseEnv,
    NODE_ENV: 'production',
    PORT: String(port),
    DATABASE_URL: databaseUrl,
    BASE_URL: baseUrl,
    APP_URL: baseUrl,
    NEXT_PUBLIC_APP_URL: baseUrl,
    PLATFORM_PORTAL_BASE_URL: baseUrl,
    JWT_SECRET: secret,
    CACHE_STRATEGY: 'sqlite',
    CACHE_SQLITE_PATH: path.join(stateDir, 'cache.sqlite'),
    QUEUE_STRATEGY: 'local',
    OM_INIT_ADMIN_PASSWORD: SEEDED_ADMIN.password,
    OM_INIT_EMPLOYEE_PASSWORD: SEEDED_ADMIN.password,
    OM_INTEGRATION_TEST: 'true',
    OM_TEST_MODE: '1',
    OM_TEST_AUTH_RATE_LIMIT_MODE: 'opt-in',
    OM_ENABLE_ENTERPRISE_MODULES: 'false',
    OM_EVENTS_SINGLE_DELIVERY: 'false',
    AUTO_SPAWN_SCHEDULER: 'false',
    DEMO_MODE: 'false',
    TENANT_DATA_ENCRYPTION_FALLBACK_KEY: 'vereino-ephemeral-fallback-key',
    DB_POOL_MIN: '2',
    DB_POOL_MAX: '20',
    CI: 'true',
  }
}

export async function startDatabase({ image = DEFAULT_POSTGRES_IMAGE, testcontainers }) {
  const { GenericContainer, Wait } = testcontainers ?? (await import('testcontainers'))
  const container = await new GenericContainer(image)
    .withEnvironment({ POSTGRES_DB: 'vereino_test', POSTGRES_USER: 'vereino', POSTGRES_PASSWORD: 'secret' })
    .withCopyContentToContainer([
      { content: POSTGRES_INIT_SQL, target: '/docker-entrypoint-initdb.d/00-extensions.sql' },
    ])
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start()
  const databaseUrl = `postgres://vereino:secret@${container.getHost()}:${String(container.getMappedPort(5432))}/vereino_test`
  return { databaseUrl, stop: () => container.stop() }
}

export function runYarn(args, { env, cwd = APP_ROOT, spawnSyncImpl = spawnSync }) {
  const result = spawnSyncImpl('yarn', args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' })
  return result.status ?? 1
}

export function startApp({ env, cwd = APP_ROOT, spawnImpl = spawn, platform = process.platform }) {
  const child = spawnImpl('yarn', ['start'], {
    cwd,
    env,
    stdio: 'inherit',
    shell: platform === 'win32',
    detached: platform !== 'win32',
  })
  const state = { exited: false }
  child.on('exit', () => {
    state.exited = true
  })
  return { child, hasExited: () => state.exited }
}

// Stops the server and every process it spawned (Next.js, workers).
export function stopProcessTree(
  child,
  { platform = process.platform, spawnSyncImpl = spawnSync, kill = process.kill } = {},
) {
  if (platform === 'win32') {
    spawnSyncImpl('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    kill(-child.pid, 'SIGTERM')
  } catch {
    // the process group is already gone
  }
}

async function probe(baseUrl, fetchImpl) {
  try {
    const page = await fetchImpl(`${baseUrl}/login`)
    if (page.status !== 200) return false
    const body = new URLSearchParams(SEEDED_ADMIN).toString()
    const login = await fetchImpl(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!login.ok) return false
    const json = await login.json()
    return typeof json.token === 'string' && json.token.length > 0
  } catch {
    return false
  }
}

// Ready = the sign-in page renders and the seeded admin gets a token.
export async function waitForReady({
  baseUrl,
  hasExited,
  fetchImpl = fetch,
  timeoutMs = 180_000,
  intervalMs = 2_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
}) {
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    if (hasExited()) throw new Error('[internal] the app process exited before it became ready')
    if (await probe(baseUrl, fetchImpl)) return
    await sleep(intervalMs)
  }
  throw new Error(`[internal] the app was not ready within ${String(timeoutMs / 1000)}s at ${baseUrl}`)
}

export function waitForSignal(processRef = process) {
  return new Promise((resolve) => {
    processRef.once('SIGINT', resolve)
    processRef.once('SIGTERM', resolve)
  })
}

export async function runEphemeral({ argv, deps = {}, log = console.log }) {
  const options = parseArgs(argv)
  const {
    startDatabaseImpl = startDatabase,
    runYarnImpl = runYarn,
    startAppImpl = startApp,
    waitForReadyImpl = waitForReady,
    stopImpl = stopProcessTree,
    waitForSignalImpl = waitForSignal,
    image = process.env.VEREINO_IT_POSTGRES_IMAGE,
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-ephemeral-')),
  } = deps
  log(`[ephemeral] starting PostgreSQL (${image ?? DEFAULT_POSTGRES_IMAGE})`)
  const database = await startDatabaseImpl({ image })
  let app = null
  try {
    const env = buildAppEnv({ databaseUrl: database.databaseUrl, port: options.port, stateDir })
    for (const step of options.build ? ['initialize', 'build'] : ['initialize']) {
      log(`[ephemeral] yarn ${step}`)
      if (runYarnImpl([step], { env }) !== 0) throw new Error(`[internal] yarn ${step} failed`)
    }
    log(`[ephemeral] starting the app on ${env.BASE_URL}`)
    app = startAppImpl({ env })
    await waitForReadyImpl({ baseUrl: env.BASE_URL, hasExited: app.hasExited })
    log(`[ephemeral] ready at ${env.BASE_URL} (sign in as ${SEEDED_ADMIN.email})`)
    if (options.mode === 'start') {
      await waitForSignalImpl()
      return 0
    }
    // Same as the platform runner: make sure the Chromium build Playwright expects is present.
    if (runYarnImpl(['playwright', 'install', 'chromium'], { env }) !== 0) {
      throw new Error('[internal] yarn playwright install chromium failed')
    }
    const args = ['playwright', 'test', '--config', PLAYWRIGHT_CONFIG, ...(options.filter ? [options.filter] : [])]
    return runYarnImpl(args, { env })
  } finally {
    if (app) stopImpl(app.child)
    await database.stop()
    fs.rmSync(stateDir, { recursive: true, force: true })
    log('[ephemeral] stopped')
  }
}

/* node:coverage ignore next 9 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runEphemeral({ argv: process.argv.slice(2) })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
