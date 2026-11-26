import http from 'node:http'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { createClub, createStaff, signInAs, uniqueSuffix, type Club } from '../../_fixtures/club'
import { startClubDomainApp, type ClubDomainApp } from '../../_fixtures/club-domain'
import { publish } from '../../_fixtures/publication'
import { startGoogleFake, type GoogleFake } from './_fixtures/google-fake'
import { STATE_COOKIE, cleanHttp, roundTrip, sessionJar } from './_fixtures/identity'

// TEST-S05 (social sign-in spec DD-S07; many clubs spec phase 3; #700): with `VEREINO_CLUB_DOMAIN` set, "Sign in with
// Google" started on a club's address goes to the provider, which returns to the one central callback on `APP_URL`; the
// callback hands the round trip back to the club's address, where the session is set and the landing page opens. A
// hand-off replayed, opened on another club's address or opened in another browser is refused without a session, and
// an identity linked in club A that starts on club B's address gets the generic outcome there. A second app process on
// the same build and database runs with the club domain (as TEST-M03); it inherits the test Google client, so the
// in-process Google fake answers both processes.
test.describe.configure({ mode: 'serial', timeout: 600_000 })

type ClubAtAddress = { club: Club; slug: string; origin: string }

let app: ClubDomainApp
let fake: GoogleFake
let clubA: ClubAtAddress
let clubB: ClubAtAddress

async function publishedClub(request: Parameters<typeof createClub>[0], label: string): Promise<ClubAtAddress> {
  const club = await createClub(request, label)
  const slug = `qa-${label}-${uniqueSuffix()}`
  await publish(request, club.adminToken, slug, [])
  return { club, slug, origin: app.clubUrl(slug) }
}

function startUrl(origin: string, redirect = '/club'): string {
  return `${origin}/api/foundation/identity/google/start?redirect=${encodeURIComponent(redirect)}`
}

async function authCookie(page: Page, origin: string): Promise<string | undefined> {
  return (await page.context().cookies(origin)).find((cookie) => cookie.name === 'auth_token')?.value
}

/** One GET without following redirects, sent to the loopback address with the URL's host in `Host` (Node does not
 * resolve `*.localhost` on every system, Chromium does). Returns the status, the location and the cookies it set. */
function rawGet(
  target: string,
  cookie = '',
): Promise<{ status: number; location: string | null; cookies: Record<string, string> }> {
  const url = new URL(target)
  return new Promise((resolve, reject) => {
    const sent = http.request(
      {
        host: '127.0.0.1',
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: { host: url.host, ...(cookie ? { cookie } : {}) },
      },
      (answer) => {
        answer.resume()
        const cookies: Record<string, string> = {}
        for (const header of answer.headers['set-cookie'] ?? []) {
          const pair = header.split(';')[0]
          const index = pair.indexOf('=')
          cookies[pair.slice(0, index)] = pair.slice(index + 1)
        }
        resolve({ status: answer.statusCode ?? 0, location: answer.headers.location ?? null, cookies })
      },
    )
    sent.on('error', reject)
    sent.end()
  })
}

/**
 * Runs a round trip from a club's address up to the hand-off without opening it (its token stays unspent): `start` on
 * the club's host, the fake's `/authorize`, the callback on `APP_URL`. Returns the hand-off URL and the state cookie
 * `start` set on the club's host (which only that "browser" holds).
 */
async function stoppedAtHandoff(origin: string): Promise<{ handoff: URL; stateCookie: string }> {
  const start = await rawGet(startUrl(origin))
  expect(start.status).toBe(302)
  const stateCookie = start.cookies[STATE_COOKIE]
  expect(stateCookie).toBeTruthy()
  const authorize = await rawGet(String(start.location))
  expect(authorize.status).toBe(302)
  const callback = await rawGet(String(authorize.location))
  expect(callback.status).toBe(303)
  const handoff = new URL(String(callback.location))
  expect(handoff.origin).toBe(origin)
  expect(handoff.pathname).toBe('/api/foundation/identity/google/handoff')
  return { handoff, stateCookie }
}

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

const cleanups: Array<() => Promise<void>> = []

// The describe's `timeout` covers the tests, not the hooks: the hooks set their own budget (#701).
test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000)
  fake = await startGoogleFake()
  cleanups.push(() => fake.stop())
  app = await startClubDomainApp()
  cleanups.push(() => app.stop())
  clubA = await publishedClub(request, 's05a')
  cleanups.push(() => clubA.club.cleanup())
  clubB = await publishedClub(request, 's05b')
  cleanups.push(() => clubB.club.cleanup())
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  for (const cleanup of cleanups.reverse()) await cleanup()
})

test('TEST-S05 Google sign-in from a club address returns there through the central callback and its hand-off', async ({
  page,
  browser,
  request,
  playwright,
  baseURL,
}) => {
  // Anna of club A links Google on the shared app (the one-club path of TEST-S01).
  const marker = uniqueSuffix()
  const anna = await createStaff(request, clubA.club, {
    firstName: 'Anna',
    lastName: `S05${marker}`,
    birthDate: '1985-04-02',
  })
  const annaToken = await signInAs(request, clubA.club, anna.userId, anna.email)
  const subject = `google-anna-s05-${marker}`
  fake.next({ sub: subject, email: `anna.s05.${marker}@gmail.test` })
  const linked = await roundTrip(cleanHttp(playwright.request, String(baseURL)), sessionJar(annaToken))
  expect(linked.target).toBe('/club/profile?identity=linked&provider=google')

  // From A's address: start → provider → the callback on APP_URL → the hand-off on A's address → the landing page there.
  fake.next({ sub: subject })
  const callbacks: string[] = []
  const handoffs: string[] = []
  page.on('request', (sent) => {
    const url = new URL(sent.url())
    if (url.pathname === '/api/foundation/identity/google/callback') callbacks.push(url.origin)
    if (url.pathname === '/api/foundation/identity/google/handoff') handoffs.push(sent.url())
  })
  await page.goto(startUrl(clubA.origin, '/club/calendar'))
  await page.waitForURL((url) => url.origin === clubA.origin && url.pathname.startsWith('/club'), { timeout: 30_000 })
  expect(callbacks).toEqual([app.appUrl])
  expect(handoffs).toHaveLength(1)
  expect(new URL(handoffs[0]).origin).toBe(clubA.origin)
  expect(new URL(page.url()).pathname).toBe('/club/calendar')
  expect(await authCookie(page, clubA.origin), 'session set on the club address').toBeTruthy()
  expect(await authCookie(page, app.appUrl), 'no session on APP_URL').toBeUndefined()

  // The same hand-off once more: its token is spent.
  const replay = await freshPage(browser)
  await replay.goto(handoffs[0])
  await expect(replay).toHaveURL(/[?&]identity=invalid/)
  expect(await authCookie(replay, clubA.origin)).toBeUndefined()
  await replay.context().close()

  // A hand-off opened on another club's address is refused, and its token is spent for the club's own address too.
  fake.next({ sub: subject })
  const toB = await stoppedAtHandoff(clubA.origin)
  const onB = await rawGet(`${clubB.origin}${toB.handoff.pathname}${toB.handoff.search}`)
  expect(onB.status).toBe(303)
  expect(onB.location).toContain('/login?identity=invalid')
  expect(onB.cookies.auth_token).toBeUndefined()
  const afterB = await rawGet(toB.handoff.toString(), `${STATE_COOKIE}=${toB.stateCookie}`)
  expect(afterB.location).toContain('/login?identity=invalid')
  expect(afterB.cookies.auth_token).toBeUndefined()

  // A hand-off copied into another browser (without the state cookie of the one that started it) is refused on the
  // club's address — and the token is spent, so the starter cannot use it afterwards either.
  fake.next({ sub: subject })
  const copied = await stoppedAtHandoff(clubA.origin)
  const other = await freshPage(browser)
  await other.goto(copied.handoff.toString())
  await expect(other).toHaveURL(new RegExp(`^${clubA.origin}/login\\?.*identity=invalid`))
  expect(await authCookie(other, clubA.origin)).toBeUndefined()
  await other.context().close()
  const starterLate = await rawGet(copied.handoff.toString(), `${STATE_COOKIE}=${copied.stateCookie}`)
  expect(starterLate.location).toContain('/login?identity=invalid')
  expect(starterLate.cookies.auth_token).toBeUndefined()

  // The hand-off with the starter's own cookie on the club's address sets the session there (the positive control of
  // the two refusals above).
  fake.next({ sub: subject })
  const own = await stoppedAtHandoff(clubA.origin)
  const accepted = await rawGet(own.handoff.toString(), `${STATE_COOKIE}=${own.stateCookie}`)
  expect(accepted.status).toBe(303)
  expect(accepted.location).toBe(`${clubA.origin}/club`)
  expect(accepted.cookies.auth_token).toBeTruthy()

  // Club A's identity started on club B's address: the generic outcome there, no session on either address.
  fake.next({ sub: subject })
  const atB = await freshPage(browser)
  await atB.goto(startUrl(clubB.origin))
  await expect(atB).toHaveURL(new RegExp(`^${clubB.origin}/login\\?.*identity=unlinked`))
  expect(await authCookie(atB, clubB.origin)).toBeUndefined()
  expect(await authCookie(atB, clubA.origin)).toBeUndefined()
  await atB.context().close()
})
