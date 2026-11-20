import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// ENG-TEST-12 and ENG-TEST-13 (engineering standards spec, phase E4; issue #462), local negative cases: the
// production build in the runner refuses to start without a required variable and names it, and the Railway start
// command fails on an empty database URL without ever running `yarn initialize` (ADR-013, S8.10). The staging cases
// of the same tests are checked by the owner once the environment exists (docs/ops/deploy.md).
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const REPO_ROOT = path.resolve(APP_ROOT, '..', '..')
const EXIT_TIMEOUT_MS = 90_000

type Exit = { code: number | null; output: string }

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

/** Runs `command` and resolves with its exit code and combined output; kills it if it is still running at the timeout. */
async function runToExit(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<Exit> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()))
    const timer = setTimeout(() => {
      output += '\n[test] still running at the timeout; killed'
      if (child.pid) process.kill(-child.pid, 'SIGKILL')
    }, EXIT_TIMEOUT_MS)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })
}

async function envWith(overrides: Record<string, string | undefined>): Promise<NodeJS.ProcessEnv> {
  const merged: NodeJS.ProcessEnv = { ...process.env, PORT: String(await freePort()), ...overrides }
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined))
}

test('ENG-TEST-12 the app refuses to start without a required variable and names it', async () => {
  test.setTimeout(EXIT_TIMEOUT_MS + 30_000)
  const secret = process.env.JWT_SECRET ?? ''
  // `next start` on the runner's production build: the same `instrumentation.ts` hook as `yarn start`, whose platform
  // CLI refuses a second server next to the runner's own. Next.js fills a variable that is unset or empty from
  // `packages/app/.env` (which `yarn generate` may copy from `.env.example`), so the removed variable is the Redis URL
  // that Railway's `CACHE_STRATEGY=redis` requires and `.env.example` leaves commented out.
  const env = await envWith({ CACHE_STRATEGY: 'redis', CACHE_REDIS_URL: undefined, REDIS_URL: undefined })
  const { code, output } = await runToExit('yarn', ['next', 'start', '--port', env.PORT ?? '0'], APP_ROOT, env)
  expect(code, output).not.toBe(0)
  expect(output).toContain('Refusing to start')
  expect(output).toContain('CACHE_REDIS_URL or REDIS_URL is missing')
  if (secret) expect(output).not.toContain(secret)
})

test('ENG-TEST-13 the Railway start command fails on an empty database URL and never initialises', async () => {
  test.setTimeout(EXIT_TIMEOUT_MS + 30_000)
  const { code, output } = await runToExit(
    'sh',
    ['./scripts/railway-start.sh'],
    REPO_ROOT,
    await envWith({ DATABASE_URL: '', REDIS_URL: 'redis://127.0.0.1:6399' }),
  )
  expect(code, output).not.toBe(0)
  expect(output).toContain('DATABASE_URL is missing')
  expect(output).not.toMatch(/initiali[sz]ation|mercato init|First run/i)
})

test('ENG-TEST-12 the started app passes the post-deploy smoke check', async ({ baseURL }) => {
  test.setTimeout(EXIT_TIMEOUT_MS + 30_000)
  const env = await envWith({ VEREINO_SMOKE_EMAIL: undefined, VEREINO_SMOKE_PASSWORD: undefined })
  const { code, output } = await runToExit('node', ['./scripts/smoke.mjs', baseURL ?? ''], REPO_ROOT, env)
  expect(code, output).toBe(0)
  for (const check of ['health', 'sign-in page', 'security headers']) expect(output).toContain(`PASS ${check}`)
  expect(output).toContain('SKIP no-store')
})
