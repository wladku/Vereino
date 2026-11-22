import { expect, test } from '@playwright/test'
import { call, createClub, createStaff, signInAs, uniqueSuffix, type Club } from '../../_fixtures/club'
import { setUserFeatures } from '../../_fixtures/members'
import { startGoogleFake, type GoogleFake } from './_fixtures/google-fake'
import {
  CookieJar,
  STATE_COOKIE,
  appPath,
  cleanHttp,
  location,
  probeLink,
  probeUserCount,
  roundTrip,
  sessionJar,
  startRoundTrip,
} from './_fixtures/identity'

// TEST-S01 (social sign-in spec; REQ-S01, REQ-S04; #566): against the in-process Google fake, a signed-in user connects
// Google from the profile; a sign-in with that identity issues the platform session and reaches `/club` with
// `last_signed_in_at` updated; a sign-in without a link, a reused, tampered or cookie-less state, a provider refusal, a
// token endpoint that times out and an id token for another client all end without a session; a user of another
// tenant cannot take the subject (generic link failure, nothing revealed); a session without
// `foundation.identity.self` cannot start a link (403); a disabled or unknown provider answers 404; no sign-in route
// creates a platform user. The state-store-down path (503) is not driven here: a running app's cache cannot be stopped
// from a test.
test.describe.configure({ timeout: 300_000, mode: 'serial' })

type IdentityList = {
  items: Array<{ id: string; provider: string; emailAtLink: string | null; emailShared: boolean; updatedAt: string }>
  canUnlink: boolean
  providers: Array<{ id: string; enabled: boolean; linked: boolean }>
}

let fake: GoogleFake
test.beforeAll(async () => {
  fake = await startGoogleFake()
})
test.afterAll(async () => {
  await fake.stop()
})

async function me(request: Parameters<typeof call>[0], token: string) {
  return call<IdentityList>(request, 'GET', '/api/foundation/identity/me', token)
}

test('TEST-S01 Google sign-in links, signs in and refuses every other path without a session or an account', async ({
  request,
  playwright,
  baseURL,
}) => {
  const http = cleanHttp(playwright.request, String(baseURL))
  const clubA = await createClub(request, 'test-s01-a')
  let clubB: Club | null = null
  try {
    const marker = uniqueSuffix()
    const anna = await createStaff(request, clubA, {
      firstName: 'Anna',
      lastName: `S01${marker}`,
      birthDate: '1985-04-02',
    })
    const annaToken = await signInAs(request, clubA, anna.userId, anna.email)
    const subject = `google-anna-${marker}`
    const annaEmail = `anna.${marker}@gmail.test`
    // Between here and the end of the failure paths no test step creates a user: every change would be a sign-in route's.
    const usersBefore = probeUserCount()

    // The provider list on `/login` and `me` name Google enabled and Facebook (phase 2) disabled.
    const providers = await request.get('/api/foundation/identity/providers')
    expect(await providers.json()).toEqual({
      providers: [
        { id: 'google', enabled: true },
        { id: 'facebook', enabled: false },
      ],
    })

    // J-S01 step 1: Anna connects Google from her profile (start with her session → link purpose).
    fake.next({ sub: subject, email: annaEmail })
    const linked = await roundTrip(http, sessionJar(annaToken))
    expect(linked.target).toBe('/club/profile?identity=linked&provider=google')
    const annaList = await me(request, annaToken)
    expect(annaList.status).toBe(200)
    expect(annaList.body?.items).toHaveLength(1)
    expect(annaList.body?.items[0]).toMatchObject({ provider: 'google', emailAtLink: annaEmail, emailShared: true })
    expect(annaList.body?.canUnlink).toBe(true)
    expect(annaList.body?.providers).toEqual([
      { id: 'google', enabled: true, linked: true },
      { id: 'facebook', enabled: false, linked: false },
    ])
    const stored = probeLink('google', subject, annaEmail)
    expect(stored).toMatchObject({
      count: 1,
      userId: anna.userId,
      tenantId: clubA.tenant.tenantId,
      organizationId: clubA.tenant.organizationId,
      lastSignedInAt: null,
      emailStored: true,
      emailStoredPlain: false,
    })

    // A second link of Google for Anna is refused before the round trip (409).
    const again = await call<{ code?: string }>(request, 'POST', '/api/foundation/identity/google/link', annaToken)
    expect(again.status).toBe(409)
    expect(again.body?.code).toBe('identity_already_linked')

    // J-S01 step 2: a sign-in with the linked identity issues the platform session and lands on `/club`; an outside
    // redirect is dropped for the default.
    fake.next({ sub: subject, email: annaEmail })
    const guest = new CookieJar()
    const signIn = await roundTrip(http, guest, { redirect: 'https://evil.example/steal' })
    expect(signIn.target).toBe('/club')
    const sessionToken = guest.get('auth_token')
    expect(sessionToken, 'auth_token cookie set by the callback').toBeTruthy()
    expect(guest.get('session_token'), 'session_token cookie set by the callback').toBeTruthy()
    expect(guest.get(STATE_COOKIE), 'state cookie cleared by the callback').toBeUndefined()
    expect((await me(request, String(sessionToken))).status).toBe(200)
    expect(probeLink('google', subject).lastSignedInAt).not.toBeNull()

    // A same-origin redirect is kept.
    fake.next({ sub: subject })
    expect((await roundTrip(http, new CookieJar(), { redirect: '/club/calendar' })).target).toBe('/club/calendar')

    // J-S02: a subject without a link → the generic outcome, no session.
    fake.next({ sub: `google-tomek-${marker}`, email: `tomek.${marker}@gmail.test` })
    const unlinkedJar = new CookieJar()
    const unlinked = await roundTrip(http, unlinkedJar)
    expect(unlinked.target).toBe('/login?identity=unlinked')
    expect(unlinkedJar.get('auth_token')).toBeUndefined()

    // A reused state: the marker was consumed by the first callback.
    fake.next({ sub: subject })
    const replayJar = new CookieJar()
    const first = await roundTrip(http, replayJar)
    expect(first.target).toBe('/club')
    const replayAttacker = new CookieJar()
    const state = new URL(first.callbackUrl, 'http://127.0.0.1').searchParams.get('state') as string
    replayAttacker.set(STATE_COOKIE, state)
    const replay = await http.get(first.callbackUrl, replayAttacker)
    expect(replay.status).toBe(303)
    expect(appPath(location(replay))).toBe('/login?identity=invalid')
    expect(replayAttacker.get('auth_token')).toBeUndefined()
    expect(replay.body).toBe(unlinked.answer.body)

    // A tampered state (the cookie no longer matches) and a callback without the state cookie.
    fake.next({ sub: subject })
    const tamperJar = new CookieJar()
    const tampered = await startRoundTrip(http, tamperJar)
    const tamperedUrl = new URL(tampered.callbackUrl, 'http://127.0.0.1')
    const original = tamperedUrl.searchParams.get('state') as string
    tamperedUrl.searchParams.set('state', `${original.slice(0, -1)}${original.endsWith('A') ? 'B' : 'A'}`)
    const tamperedAnswer = await http.get(`${tamperedUrl.pathname}${tamperedUrl.search}`, tamperJar)
    expect(appPath(location(tamperedAnswer))).toBe('/login?identity=invalid')
    fake.next({ sub: subject })
    const noCookie = await startRoundTrip(http, new CookieJar())
    const noCookieAnswer = await http.get(noCookie.callbackUrl, new CookieJar())
    expect(appPath(location(noCookieAnswer))).toBe('/login?identity=invalid')
    expect(noCookieAnswer.setCookie).not.toContain('auth_token=')

    // The provider refuses; the token endpoint fails; it times out (5 s); the id token names another client.
    for (const behaviour of ['deny', 'error', 'hang', 'foreign_audience'] as const) {
      fake.next({ sub: subject, behaviour })
      const jar = new CookieJar()
      const answer = await roundTrip(http, jar)
      expect(answer.target, behaviour).toBe('/login?identity=failed')
      expect(jar.get('auth_token'), behaviour).toBeUndefined()
    }
    expect(probeUserCount()).toBe(usersBefore)

    // A user of another tenant tries to take Anna's subject: the generic link failure, nothing revealed, Anna's link
    // unchanged and nothing linked to the other user.
    clubB = await createClub(request, 'test-s01-b')
    const wiktor = await createStaff(request, clubB, {
      firstName: 'Wiktor',
      lastName: `S01${marker}`,
      birthDate: '1980-01-10',
    })
    const wiktorToken = await signInAs(request, clubB, wiktor.userId, wiktor.email)
    fake.next({ sub: subject, email: annaEmail })
    const taken = await roundTrip(http, sessionJar(wiktorToken))
    expect(taken.target).toBe('/club/profile?identity=failed&provider=google')
    expect(taken.answer.body).toBe('')
    expect((await me(request, wiktorToken)).body?.items).toEqual([])
    expect(probeLink('google', subject)).toMatchObject({
      count: 1,
      userId: anna.userId,
      tenantId: clubA.tenant.tenantId,
    })

    // A session that changed between start and callback cannot finish a link round trip.
    fake.next({ sub: `google-wiktor-${marker}` })
    const switched = sessionJar(wiktorToken)
    const switchedStart = await startRoundTrip(http, switched)
    switched.set('auth_token', annaToken)
    const switchedAnswer = await http.get(switchedStart.callbackUrl, switched)
    expect(appPath(location(switchedAnswer))).toBe('/login?identity=invalid')
    expect((await me(request, annaToken)).body?.items).toHaveLength(1)

    // A session without `foundation.identity.self` cannot start a link.
    const bartek = await createStaff(request, clubA, {
      firstName: 'Bartek',
      lastName: `S01${marker}`,
      birthDate: '1990-06-15',
    })
    const bartekToken = await signInAs(request, clubA, bartek.userId, bartek.email)
    await setUserFeatures(request, clubA, bartek.userId, ['people.self'])
    const refused = await http.get('/api/foundation/identity/google/start', sessionJar(bartekToken))
    expect(refused.status).toBe(403)
    expect(refused.setCookie).not.toContain(`${STATE_COOKIE}=`)

    // A disabled (phase 2) and an unknown provider.
    const facebook = await http.get('/api/foundation/identity/facebook/start')
    expect(facebook.status).toBe(404)
    expect((JSON.parse(facebook.body) as { code?: string }).code).toBe('identity_provider_disabled')
    expect((await http.get('/api/foundation/identity/apple/start')).status).toBe(404)
    const unknownCallback = await http.get('/api/foundation/identity/apple/callback?code=x&state=y')
    expect(appPath(location(unknownCallback))).toBe('/login?identity=invalid')
  } finally {
    if (clubB) await clubB.cleanup()
    await clubA.cleanup()
  }
})
