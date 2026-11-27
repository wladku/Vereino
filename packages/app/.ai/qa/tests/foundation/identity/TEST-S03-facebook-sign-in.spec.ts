import { expect, test, type APIRequest } from '@playwright/test'
import { call, createClub, createStaff, signInAs, uniqueSuffix } from '../../_fixtures/club'
import { uiText } from '../../_fixtures/ui-text'
import { facebookSignedRequest, startOAuthFake, type OAuthFake } from './_fixtures/google-fake'
import {
  CookieJar,
  STATE_COOKIE,
  cleanHttp,
  probeLink,
  probeUserCount,
  roundTrip,
  sessionJar,
} from './_fixtures/identity'

// TEST-S03 (social sign-in spec; REQ-S03, AC-S03; J-S03; #567): against the in-process Facebook fake, a signed-in user
// connects Facebook from the profile while Facebook shares no e-mail (the link stores none and says so), then signs in
// with it and reaches `/club` with `last_signed_in_at` updated; a second user's link keeps the shared e-mail encrypted;
// a subject without a link, a refusal at Facebook, a failing token endpoint and a failing Graph `/me` end without a
// session. The data-deletion callback refuses a missing or badly signed `signed_request` (400, the link kept), deletes
// the link of a valid one and answers the status URL and a confirmation code — again for a repeat and for an unknown
// user id — and the status page shows the code. A body over 16 KiB or a chunked one without `content-length` is refused
// with 413 before it is read (#833). Only Facebook has the callback (404 for Google). No route creates a platform user.
test.describe.configure({ timeout: 300_000, mode: 'serial' })

type IdentityList = {
  items: Array<{ id: string; provider: string; emailAtLink: string | null; emailShared: boolean }>
  canUnlink: boolean
  providers: Array<{ id: string; enabled: boolean; linked: boolean }>
}

type DeletionAnswer = { status: number; body: { url?: string; confirmation_code?: string; error?: string } }

/** POSTs a form body as a stream, so it goes chunked without `content-length` (#833). */
async function chunkedDeletion(baseURL: string, form: Record<string, string>): Promise<DeletionAnswer> {
  const bytes = new TextEncoder().encode(new URLSearchParams(form).toString())
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const response = await fetch(new URL('/api/foundation/identity/facebook/deletion', baseURL), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  return { status: response.status, body: (await response.json()) as DeletionAnswer['body'] }
}

let fake: OAuthFake
test.beforeAll(async () => {
  fake = await startOAuthFake()
})
test.afterAll(async () => {
  await fake.stop()
})

/** POSTs Facebook's form-encoded `signed_request` without any session cookie. */
async function deletion(
  api: APIRequest,
  baseURL: string,
  form: Record<string, string>,
  provider = 'facebook',
): Promise<DeletionAnswer> {
  const context = await api.newContext({ baseURL })
  try {
    const response = await context.post(`/api/foundation/identity/${provider}/deletion`, { form })
    return { status: response.status(), body: (await response.json()) as DeletionAnswer['body'] }
  } finally {
    await context.dispose()
  }
}

test('TEST-S03 Facebook links without an e-mail, signs in, and its deletion callback removes the link', async ({
  request,
  playwright,
  page,
  baseURL,
}) => {
  const base = String(baseURL)
  const http = cleanHttp(playwright.request, base)
  const club = await createClub(request, 'test-s03')
  try {
    const marker = uniqueSuffix()
    const marta = await createStaff(request, club, {
      firstName: 'Marta',
      lastName: `S03${marker}`,
      birthDate: '1987-03-03',
    })
    const piotr = await createStaff(request, club, {
      firstName: 'Piotr',
      lastName: `S03${marker}`,
      birthDate: '1982-08-08',
    })
    const martaToken = await signInAs(request, club, marta.userId, marta.email)
    const piotrToken = await signInAs(request, club, piotr.userId, piotr.email)
    const me = (token: string) => call<IdentityList>(request, 'GET', '/api/foundation/identity/me', token)
    const martaSubject = `fb-marta-${marker}`
    const piotrSubject = `fb-piotr-${marker}`
    const piotrEmail = `piotr.${marker}@facebook.test`
    // From here on no test step creates a user: every change would be a sign-in route's.
    const usersBefore = probeUserCount()

    // J-S03 step 1: Marta connects Facebook from her profile; Facebook shares no e-mail.
    fake.next({ sub: martaSubject, email: null })
    const linked = await roundTrip(http, sessionJar(martaToken), { provider: 'facebook' })
    expect(linked.target).toBe('/club/profile?identity=linked&provider=facebook')
    const martaList = await me(martaToken)
    expect(martaList.status).toBe(200)
    expect(martaList.body?.items).toHaveLength(1)
    expect(martaList.body?.items[0]).toMatchObject({ provider: 'facebook', emailAtLink: null, emailShared: false })
    expect(martaList.body?.providers).toContainEqual({ id: 'facebook', enabled: true, linked: true })
    expect(probeLink('facebook', martaSubject)).toMatchObject({
      count: 1,
      userId: marta.userId,
      tenantId: club.tenant.tenantId,
      organizationId: club.tenant.organizationId,
      lastSignedInAt: null,
      emailStored: false,
    })

    // Piotr's Facebook shares an e-mail: shown in his list, stored encrypted.
    fake.next({ sub: piotrSubject, email: piotrEmail })
    const piotrLinked = await roundTrip(http, sessionJar(piotrToken), { provider: 'facebook' })
    expect(piotrLinked.target).toBe('/club/profile?identity=linked&provider=facebook')
    expect((await me(piotrToken)).body?.items[0]).toMatchObject({ emailAtLink: piotrEmail, emailShared: true })
    expect(probeLink('facebook', piotrSubject, piotrEmail)).toMatchObject({
      count: 1,
      userId: piotr.userId,
      emailStored: true,
      emailStoredPlain: false,
    })

    // J-S03 step 1 (sign-in): Marta signs in with Facebook and reaches `/club` with the platform session.
    fake.next({ sub: martaSubject })
    const guest = new CookieJar()
    const signIn = await roundTrip(http, guest, { provider: 'facebook' })
    expect(signIn.target).toBe('/club')
    const sessionToken = guest.get('auth_token')
    expect(sessionToken, 'auth_token cookie set by the callback').toBeTruthy()
    expect(guest.get('session_token'), 'session_token cookie set by the callback').toBeTruthy()
    expect(guest.get(STATE_COOKIE), 'state cookie cleared by the callback').toBeUndefined()
    expect((await me(String(sessionToken))).body?.items[0]).toMatchObject({ provider: 'facebook' })
    expect(probeLink('facebook', martaSubject).lastSignedInAt).not.toBeNull()

    // A subject without a link, and Facebook failing at each step: the generic outcomes, no session.
    fake.next({ sub: `fb-nobody-${marker}` })
    const unlinkedJar = new CookieJar()
    expect((await roundTrip(http, unlinkedJar, { provider: 'facebook' })).target).toBe('/login?identity=unlinked')
    expect(unlinkedJar.get('auth_token')).toBeUndefined()
    for (const behaviour of ['deny', 'error', 'me_error'] as const) {
      fake.next({ sub: martaSubject, behaviour })
      const jar = new CookieJar()
      expect((await roundTrip(http, jar, { provider: 'facebook' })).target, behaviour).toBe('/login?identity=failed')
      expect(jar.get('auth_token'), behaviour).toBeUndefined()
    }
    expect(probeUserCount()).toBe(usersBefore)

    // Deletion callback: a missing and a badly signed `signed_request` are refused and the link stays.
    const api = playwright.request
    const missing = await deletion(api, base, {})
    expect(missing.status).toBe(400)
    const forged = await deletion(api, base, { signed_request: facebookSignedRequest(martaSubject, 'not-the-secret') })
    expect(forged.status).toBe(400)
    expect(forged.body).toEqual({ error: 'Bad request' })
    expect(probeLink('facebook', martaSubject).count).toBe(1)

    // #833: a body over 16 KiB, or a chunked one without `content-length`, is refused unread even when validly signed.
    const valid = facebookSignedRequest(martaSubject)
    const oversized = await deletion(api, base, { signed_request: valid, padding: 'x'.repeat(20_000) })
    expect(oversized.status).toBe(413)
    expect(oversized.body).toEqual({ error: 'Payload too large' })
    const chunked = await chunkedDeletion(base, { signed_request: valid })
    expect(chunked.status).toBe(413)
    expect(probeLink('facebook', martaSubject).count).toBe(1)

    // A valid request deletes Marta's link and answers the status URL with a confirmation code.
    const deleted = await deletion(api, base, { signed_request: facebookSignedRequest(martaSubject) })
    expect(deleted.status).toBe(200)
    const code = String(deleted.body.confirmation_code)
    expect(code).toMatch(/^[a-f0-9]{16}$/)
    const statusUrl = new URL(String(deleted.body.url))
    expect(`${statusUrl.pathname}${statusUrl.search}`).toBe(`/identity/deletion?code=${code}`)
    expect(probeLink('facebook', martaSubject).count).toBe(0)
    expect((await me(martaToken)).body?.items).toEqual([])
    expect(probeLink('facebook', piotrSubject).count).toBe(1)

    // Idempotent: the repeat and an unknown user id get a fresh code too, revealing nothing.
    const repeat = await deletion(api, base, { signed_request: facebookSignedRequest(martaSubject) })
    expect(repeat.status).toBe(200)
    expect(repeat.body.confirmation_code).toMatch(/^[a-f0-9]{16}$/)
    expect(repeat.body.confirmation_code).not.toBe(code)
    const unknown = await deletion(api, base, { signed_request: facebookSignedRequest(`fb-unknown-${marker}`) })
    expect(unknown.status).toBe(200)

    // Only Facebook has the callback.
    const google = await deletion(api, base, { signed_request: facebookSignedRequest(piotrSubject) }, 'google')
    expect(google.status).toBe(404)
    expect(probeLink('facebook', piotrSubject).count).toBe(1)

    // The status page shows the code without a session.
    await page.goto(`${statusUrl.pathname}${statusUrl.search}`)
    const status = page.getByTestId('identity-deletion-status')
    await expect(status).toContainText(uiText('foundation.identity.deletion.done'))
    await expect(status).toContainText(code)
    await page.goto('/identity/deletion?code=nonsense')
    await expect(page.getByTestId('identity-deletion-unknown')).toBeVisible()

    // A sign-in with the deleted link now finds none.
    fake.next({ sub: martaSubject })
    expect((await roundTrip(http, new CookieJar(), { provider: 'facebook' })).target).toBe('/login?identity=unlinked')
    expect(probeUserCount()).toBe(usersBefore)
  } finally {
    await club.cleanup()
  }
})
