import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { startClubDomainApp, type ClubDomainApp } from '../../_fixtures/club-domain'
import { CookieJar, STATE_COOKIE, appPath, cleanHttp, location, probeUserCount } from './_fixtures/identity'

// TEST-S06 (social sign-in spec; REQ-S04, AC-S04; #848): with the state store down, a sign-in never starts and never
// ends with a session or an account. A running app's cache cannot be stopped from a test, so a second app process on
// the same build and database runs with a cache that cannot write: the `jsonfile` strategy pointed at a file below a
// regular file, so every write fails (ENOTDIR) and every read misses. `start` answers 503 `identity_unavailable` with
// no state cookie and no redirect to the provider (fail closed, DD-S04); the callback finds no state marker and ends on
// the generic failure without a session cookie; no request creates a platform user.
test.describe.configure({ timeout: 300_000, mode: 'serial' })

let app: ClubDomainApp | null = null
let stateDir = ''

test.beforeAll(async () => {
  test.setTimeout(300_000)
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-s06-cache-'))
  const blocker = path.join(stateDir, 'not-a-directory')
  fs.writeFileSync(blocker, '')
  app = await startClubDomainApp({
    CACHE_STRATEGY: 'jsonfile',
    CACHE_JSON_FILE_PATH: path.join(blocker, 'cache.json'),
  })
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  if (app) await app.stop()
  if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true })
})

test('TEST-S06 an unreachable state store answers 503 identity_unavailable without a cookie, a session or an account', async ({
  playwright,
}) => {
  const http = cleanHttp(playwright.request, String(app?.appUrl))
  const usersBefore = probeUserCount()

  for (const provider of ['google', 'facebook']) {
    const jar = new CookieJar()
    const start = await http.get(`/api/foundation/identity/${provider}/start?redirect=%2Fclub`, jar)
    expect(start.status, `${provider}: ${start.body}`).toBe(503)
    expect(start.location, provider).toBeNull()
    expect(JSON.parse(start.body) as { code?: string }, provider).toMatchObject({ code: 'identity_unavailable' })
    expect(start.setCookie, provider).not.toContain(STATE_COOKIE)
    expect(jar.get(STATE_COOKIE), provider).toBeUndefined()
    expect(jar.get('auth_token'), provider).toBeUndefined()
  }

  // A callback whose state and cookie match finds no marker in the store: the generic failure, no session.
  const state = randomBytes(32).toString('base64url')
  const jar = new CookieJar({ [STATE_COOKIE]: state })
  const callback = await http.get(`/api/foundation/identity/google/callback?state=${state}&code=s06-code`, jar)
  expect(callback.status, callback.body).toBe(303)
  const target = new URL(appPath(location(callback)), 'http://127.0.0.1')
  expect(target.pathname).toBe('/login')
  expect(target.searchParams.get('identity')).toBe('invalid')
  expect(callback.setCookie).not.toContain('auth_token=')
  expect(jar.get('auth_token')).toBeUndefined()

  expect(probeUserCount()).toBe(usersBefore)
})
