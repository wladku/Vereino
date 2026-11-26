import { expect, test } from '@playwright/test'
import { DEFAULT_CREDENTIALS } from '@open-mercato/core/helpers/integration/auth'
import {
  capturedCount,
  completeSecondFactor,
  isChallenge,
  postLogin,
  postVerify,
  textOf,
  waitForCode,
} from '../../_fixtures/auth'
import { call, createClub } from '../../_fixtures/club'
import { create } from '../../_fixtures/club-structure'
import { challenged, cleanApi, grantRole, staffAccount, wrongCode } from './_fixtures/second-factor'

// TEST-2F01 (staff second factor spec; REQ-2F01, REQ-2F03, REQ-2F05; AC-2F01, AC-2F03, AC-2F05; #736): a club
// administrator, a treasurer and the platform super-admin who sign in with a password get a provisional token and an
// e-mailed code, and nothing else: the token reaches no staff API, no back-office page and no session refresh. The right
// code issues a full session once; four wrong codes count down and the fifth ends the challenge with its session; a
// second resend within 60 s is refused; the sixth challenge of a user in an hour is refused (through the test limiter);
// a coach made treasurer loses the session issued before. Coordinators and coaches sign in as before.
test.describe.configure({ timeout: 240_000 })

const LIMITED = { 'x-om-test-rate-limit': 'on' }
const STAFF_API = '/api/foundation/identity/me'

test('TEST-2F01 administrators, treasurers and the super-admin finish a password sign-in with the e-mailed code', async ({
  request,
  playwright,
  baseURL,
}) => {
  const club = await createClub(request, 'test-2f01')
  const api = await cleanApi(playwright, baseURL)
  try {
    const treasurer = await staffAccount(request, club, 'Ewa', 'treasurer')
    const sectionId = await create(request, club.adminToken, 'sections', { name: 'Akademia' })
    const coordinator = await staffAccount(request, club, 'Olga', 'coordinator', { sectionId })
    const coach = await staffAccount(request, club, 'Tomek', 'coach')

    // (1) The administrator: a challenge, the provisional token in `auth_token`, `session_token` cleared, no refresh
    // token. The treasurer likewise; the coordinator and the coach sign in directly.
    const raw = await api.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password, remember: 'on' },
    })
    expect(raw.status()).toBe(200)
    const rawBody = (await raw.json()) as Record<string, unknown>
    expect(rawBody.redirect).toBe('/login/second-factor')
    expect(rawBody.refreshToken).toBeUndefined()
    expect(rawBody.secondFactor).toMatchObject({ method: 'email_code' })
    expect(String((rawBody.secondFactor as { emailHint?: string }).emailHint)).toContain('•••@')
    const cookies = raw.headersArray().filter((header) => header.name.toLowerCase() === 'set-cookie')
    expect(cookies.find((cookie) => cookie.value.startsWith('session_token=;'))).toBeDefined()
    expect(cookies.filter((cookie) => /^session_token=[^;]+;/.test(cookie.value))).toEqual([])
    expect(cookies.find((cookie) => cookie.value.startsWith(`auth_token=${String(rawBody.token)}`))).toBeDefined()

    const admin = await challenged(api, club.tenant.email, club.tenant.password)
    const ewa = await challenged(api, treasurer.email, treasurer.password)
    for (const plain of [coordinator, coach]) {
      const answer = await postLogin(api, plain.email, plain.password)
      expect(answer.status).toBe(200)
      expect(answer.body?.secondFactor).toBeUndefined()
      expect((await call(api, 'GET', STAFF_API, String(answer.body?.token))).status).toBe(200)
    }

    // (2) The provisional token: a staff API answers 401, `/backend` goes to `/login`, the refresh mints nothing.
    expect((await call(api, 'GET', STAFF_API, admin.token)).status).toBe(401)
    // `/backend` hands the browser to the session refresh, which refuses the provisional token and sends it to `/login`.
    const page = await api.get('/backend', { headers: { cookie: `auth_token=${admin.token}` } })
    expect(new URL(page.url()).pathname).toBe('/login')
    const refresh = await api.get('/api/auth/session/refresh', {
      headers: { cookie: `auth_token=${admin.token}` },
      maxRedirects: 0,
    })
    expect(refresh.headers().location ?? '').toContain('/login')

    // (3) Four wrong codes count down, then the right one issues a session that reaches the staff API.
    const left: unknown[] = []
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const wrong = await postVerify(api, admin.token, wrongCode(admin.code))
      expect(wrong.status).toBe(400)
      expect(wrong.body?.code).toBe('second_factor_code_invalid')
      left.push(wrong.body?.attemptsLeft)
    }
    expect(left).toEqual([4, 3, 2, 1])
    const verified = await postVerify(api, admin.token, admin.code)
    expect(verified.status, JSON.stringify(verified.body)).toBe(200)
    expect(verified.body?.redirect).toBe('/backend')
    expect((await call(api, 'GET', STAFF_API, String(verified.body?.token))).status).toBe(200)
    // (4) The same code again: the challenge and its provisional session are gone.
    expect((await postVerify(api, admin.token, admin.code)).status).toBe(401)

    // The treasurer's right code works the first time.
    const ewaVerified = await postVerify(api, ewa.token, ewa.code)
    expect(ewaVerified.status).toBe(200)

    // The session the code issues is a staff session (S8.5, #737): "remember me" gives it no long-lived
    // `session_token` cookie, and it reports as a staff session with the idle timeout.
    const rememberedSince = capturedCount(treasurer.email)
    const rememberedLogin = await postLogin(api, treasurer.email, treasurer.password, { remember: 'on' })
    expect(isChallenge(rememberedLogin)).toBe(true)
    const rememberedCode = await waitForCode(treasurer.email, rememberedSince)
    const fullAnswer = await api.post('/api/foundation/second-factor/verify', {
      headers: { Authorization: `Bearer ${textOf(rememberedLogin.body, 'token')}`, 'Content-Type': 'application/json' },
      data: { code: rememberedCode },
    })
    expect(fullAnswer.status()).toBe(200)
    const refreshCookie = fullAnswer
      .headersArray()
      .find((header) => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('session_token='))
    const refreshExpires = Date.parse(/expires=([^;]+)/i.exec(refreshCookie?.value ?? '')?.[1] ?? '')
    expect(refreshExpires).toBeLessThanOrEqual(Date.now() + 8 * 60 * 60 * 1000 + 60_000)
    const fullToken = String(((await fullAnswer.json()) as Record<string, unknown>).token)
    const activity = await call<{ staff?: boolean }>(api, 'POST', '/api/foundation/session/activity', fullToken)
    expect(activity.status).toBe(200)
    expect(activity.body?.staff).toBe(true)

    // (5) A fresh challenge with five wrong codes ends; the right code no longer helps.
    const locked = await challenged(api, treasurer.email, treasurer.password)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await postVerify(api, locked.token, wrongCode(locked.code))).status).toBe(400)
    }
    const fifth = await postVerify(api, locked.token, wrongCode(locked.code))
    expect(fifth.status).toBe(401)
    expect(fifth.body?.code).toBe('second_factor_challenge_expired')
    expect((await postVerify(api, locked.token, locked.code)).status).toBe(401)

    // (6) A resend within 60 s of the send is refused with the time of the next one.
    const resent = await challenged(api, treasurer.email, treasurer.password)
    const early = await api.post('/api/foundation/second-factor/resend', {
      headers: { Authorization: `Bearer ${resent.token}` },
    })
    expect(early.status()).toBe(429)
    const earlyBody = (await early.json()) as { code?: string; nextResendAt?: string }
    expect(earlyBody.code).toBe('second_factor_resend_limited')
    expect(Date.parse(String(earlyBody.nextResendAt))).toBeGreaterThan(Date.now())

    // (7) The sixth challenge of one user in an hour is refused (the hourly cap, counted by the test limiter).
    const capped = await staffAccount(request, club, 'Iga', 'treasurer')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await challenged(api, capped.email, capped.password, LIMITED)
    }
    const sixth = await postLogin(api, capped.email, capped.password, {}, LIMITED)
    expect(sixth.status).toBe(429)
    expect(sixth.body?.code).toBe('second_factor_challenges_limited')
    expect(sixth.body?.token).toBeUndefined()

    // (8) A coach signed in, then made treasurer: the role sync ends the old session.
    const tomek = await postLogin(api, coach.email, coach.password)
    const tomekToken = String(tomek.body?.token)
    expect((await call(api, 'GET', STAFF_API, tomekToken)).status).toBe(200)
    await grantRole(request, club, coach.personId, coach.userId, 'treasurer')
    await expect.poll(async () => (await call(api, 'GET', STAFF_API, tomekToken)).status, { timeout: 20_000 }).toBe(401)
    await challenged(api, coach.email, coach.password)

    // (9) The platform super-admin is challenged too and completes with the code (Q-2F02).
    const superadmin = DEFAULT_CREDENTIALS.superadmin
    const sup = await challenged(api, superadmin.email, superadmin.password)
    // Other workers may sign the super-admin in meanwhile: try the codes sent since this sign-in, newest first.
    const supToken = await completeSecondFactor(api, superadmin.email, sup.token, sup.since)
    expect((await call(api, 'GET', STAFF_API, supToken)).status).not.toBe(401)
  } finally {
    await api.dispose()
    await club.cleanup()
  }
})
