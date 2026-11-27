import { expect, test } from '@playwright/test'
import { capturedCount, clearAuthTokenCache, getAuthToken, postLogin } from '../../_fixtures/auth'
import { OPTIMISTIC_LOCK_HEADER, call, createClub, mercato, uniqueSuffix, type Club } from '../../_fixtures/club'
import { startOAuthFake, type OAuthFake } from '../identity/_fixtures/google-fake'
import { CookieJar, cleanHttp, probeLink, roundTrip, sessionJar } from '../identity/_fixtures/identity'
import { challenged, cleanApi, staffAccount } from './_fixtures/second-factor'

// TEST-2F03 (staff second factor spec; REQ-2F02, REQ-2F04; AC-2F02, AC-2F04; DD-2F06, DD-2F07; #736), phase 1 items:
// (1) a treasurer with a Google link signs in with Google and reaches the staff API; (3) the club administrator resets
// the treasurer's second factor with a note: the link is gone and (4) the session issued by Google ends; (5) the
// treasurer then signs in with the password and the e-mailed code; (6) the administrator cannot reset themselves (403);
// (7) a user of another club and a user without the requirement answer 404; (8) the operator's shell reset ends the
// administrator's sessions, and `end-sessions` ends every required user's sessions of the club; (2) the same treasurer
// may connect Facebook (#567), but a Facebook sign-in ends on `/login?second_factor=use_google` without a session.
// Phase 2 (#841): (9) the treasurer, linked to Google again, is refused the password (403 `second_factor_use_google`,
// no session) and admitted with Google; `secondFactorRequired` of `me` is true for her and false for the coach; the
// administrator's plain unlink of her Google link answers 409 `second_factor_reset_required` and keeps the link (the
// record routes it through the reset), the reset then removes it, and the password is challenged again.
test.describe.configure({ timeout: 300_000, mode: 'serial' })

const STAFF_API = '/api/foundation/identity/me'
const RESET = '/api/foundation/second-factor/reset'

let fake: OAuthFake
test.beforeAll(async () => {
  fake = await startOAuthFake()
})
test.afterAll(async () => {
  await fake.stop()
})

test('TEST-2F03 Google signs a treasurer in, Facebook does not; the reset removes links and sessions; self, other clubs and the shell', async ({
  request,
  playwright,
  baseURL,
}) => {
  const http = cleanHttp(playwright.request, String(baseURL))
  const api = await cleanApi(playwright, baseURL)
  const club = await createClub(request, 'test-2f03-a')
  let other: Club | null = null
  try {
    const marker = uniqueSuffix()
    const treasurer = await staffAccount(request, club, 'Ewa', 'treasurer')
    const coach = await staffAccount(request, club, 'Tomek', 'coach')
    const treasurerToken = await getAuthToken(request, treasurer.email, treasurer.password)

    // (1) The treasurer connects Google, then signs in with it: a full session that reaches the staff API.
    const subject = `google-ewa-${marker}`
    fake.next({ sub: subject, email: `ewa.${marker}@gmail.test` })
    expect((await roundTrip(http, sessionJar(treasurerToken))).target).toBe(
      '/club/profile?identity=linked&provider=google',
    )
    fake.next({ sub: subject })
    const google = new CookieJar()
    await roundTrip(http, google)
    const googleToken = String(google.get('auth_token'))
    expect(googleToken).not.toBe('undefined')
    expect((await call(api, 'GET', STAFF_API, googleToken)).status).toBe(200)

    // (2) Facebook is no second factor: the treasurer may connect it, but signing in with it sets no session.
    const facebookSubject = `facebook-ewa-${marker}`
    fake.next({ sub: facebookSubject, email: null })
    expect((await roundTrip(http, sessionJar(treasurerToken), { provider: 'facebook' })).target).toBe(
      '/club/profile?identity=linked&provider=facebook',
    )
    fake.next({ sub: facebookSubject })
    const facebook = new CookieJar()
    expect((await roundTrip(http, facebook, { provider: 'facebook' })).target).toBe('/login?second_factor=use_google')
    expect(facebook.get('auth_token')).toBeFalsy()

    // The person record's list tells the administrator the treasurer may be reset; not the coach, not oneself.
    const listOf = async (personId: string) =>
      call<{ secondFactor?: { userId: string | null; required: boolean; canReset: boolean } }>(
        api,
        'GET',
        `/api/foundation/identity?personId=${personId}`,
        club.adminToken,
      )
    expect((await listOf(treasurer.personId)).body?.secondFactor).toEqual({
      userId: treasurer.userId,
      required: true,
      canReset: true,
      unlinkGoogleThroughReset: true,
    })
    expect((await listOf(coach.personId)).body?.secondFactor).toMatchObject({
      required: false,
      canReset: false,
      unlinkGoogleThroughReset: false,
    })
    expect((await listOf(club.adminPersonId)).body?.secondFactor).toMatchObject({
      required: true,
      canReset: false,
      unlinkGoogleThroughReset: false,
    })

    // A note is required.
    const noNote = await call(api, 'POST', RESET, club.adminToken, { data: { userId: treasurer.userId, note: '' } })
    expect(noNote.status).toBe(400)

    // (3) The administrator resets the treasurer: the Google link is gone, (4) the Google session ends.
    const reset = await call<{ ok?: boolean; unlinked?: number; sessionsEnded?: boolean }>(
      api,
      'POST',
      RESET,
      club.adminToken,
      {
        data: { userId: treasurer.userId, note: 'phoned back 2026-12-03' },
      },
    )
    expect(reset.status, JSON.stringify(reset.body)).toBe(200)
    expect(reset.body).toEqual({ ok: true, unlinked: 2, sessionsEnded: true })
    expect(probeLink('google', subject).count).toBe(0)
    expect(probeLink('facebook', facebookSubject).count).toBe(0)
    expect((await call(api, 'GET', STAFF_API, googleToken)).status).toBe(401)
    expect((await call(api, 'GET', STAFF_API, treasurerToken)).status).toBe(401)

    // (5) The password now needs the e-mailed code.
    await challenged(api, treasurer.email, treasurer.password)

    // (6) Not oneself.
    const self = await call<{ code?: string }>(api, 'POST', RESET, club.adminToken, {
      data: { userId: club.adminUserId, note: 'myself' },
    })
    expect(self.status).toBe(403)
    expect(self.body?.code).toBe('second_factor_reset_self')

    // (7) A user of another club and a user without the requirement answer like an unknown one.
    other = await createClub(request, 'test-2f03-b')
    for (const userId of [other.adminUserId, coach.userId, '00000000-0000-4000-8000-000000000000']) {
      const refused = await call(api, 'POST', RESET, club.adminToken, { data: { userId, note: 'not mine' } })
      expect(refused.status, userId).toBe(404)
    }
    // A treasurer holds no reset feature.
    clearAuthTokenCache()
    const treasurerFull = await getAuthToken(request, treasurer.email, treasurer.password)
    const forbidden = await call(api, 'POST', RESET, treasurerFull, {
      data: { userId: club.adminUserId, note: 'not allowed' },
    })
    expect(forbidden.status).toBe(403)

    // (8) The operator resets the administrator from the shell: the administrator's sessions end.
    expect((await call(api, 'GET', STAFF_API, club.adminToken)).status).toBe(200)
    const shell = mercato([
      'foundation',
      'second-factor',
      'reset',
      '--tenant',
      club.tenant.tenantId,
      '--org',
      club.tenant.organizationId,
      '--email',
      club.tenant.email,
      '--note',
      'operator verified by video call',
    ]) as { userId?: string; sessionsEnded?: boolean }
    expect(shell).toMatchObject({ userId: club.adminUserId, sessionsEnded: true })
    expect((await call(api, 'GET', STAFF_API, club.adminToken)).status).toBe(401)

    // `end-sessions` (the rollout step, Q-2F05) ends the treasurer's fresh session and leaves the coach's.
    const coachSignIn = await api.post('/api/auth/login', { form: { email: coach.email, password: coach.password } })
    const coachToken = String(((await coachSignIn.json()) as { token?: string }).token)
    const ended = mercato([
      'foundation',
      'second-factor',
      'end-sessions',
      '--tenant',
      club.tenant.tenantId,
      '--org',
      club.tenant.organizationId,
    ]) as { required?: number; sessionsEnded?: number }
    expect(ended.required).toBeGreaterThanOrEqual(2)
    expect((await call(api, 'GET', STAFF_API, treasurerFull)).status).toBe(401)
    expect((await call(api, 'GET', STAFF_API, coachToken)).status).toBe(200)

    // (9) Phase 2: the treasurer connects Google again; from then on the password is refused and Google admits her.
    clearAuthTokenCache()
    const treasurerAgain = await getAuthToken(request, treasurer.email, treasurer.password)
    const me = (token: string) =>
      call<{ secondFactorRequired?: boolean; items?: Array<{ id: string; provider: string; updatedAt: string }> }>(
        api,
        'GET',
        STAFF_API,
        token,
      )
    expect((await me(treasurerAgain)).body?.secondFactorRequired).toBe(true)
    expect((await me(coachToken)).body?.secondFactorRequired).toBe(false)
    const again = `google-ewa-again-${marker}`
    fake.next({ sub: again, email: `ewa.again.${marker}@gmail.test` })
    expect((await roundTrip(http, sessionJar(treasurerAgain))).target).toBe(
      '/club/profile?identity=linked&provider=google',
    )
    const sentBefore = capturedCount(treasurer.email)
    const refused = await postLogin(api, treasurer.email, treasurer.password)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body?.code).toBe('second_factor_use_google')
    expect(refused.body?.token).toBeUndefined()
    expect(refused.body?.secondFactor).toBeUndefined()
    expect(capturedCount(treasurer.email), 'no code is e-mailed').toBe(sentBefore)
    fake.next({ sub: again })
    const googleAgain = new CookieJar()
    await roundTrip(http, googleAgain)
    const googleAgainToken = String(googleAgain.get('auth_token'))
    expect(googleAgainToken).not.toBe('undefined')
    expect((await call(api, 'GET', STAFF_API, googleAgainToken)).status).toBe(200)

    // The administrator's plain unlink of that Google link is refused; it goes through the reset (negative case).
    clearAuthTokenCache()
    const adminAgain = await getAuthToken(request, club.tenant.email, club.tenant.password)
    const googleLink = (await me(googleAgainToken)).body?.items?.find((item) => item.provider === 'google')
    expect(googleLink).toBeTruthy()
    const plain = await call<{ code?: string }>(
      api,
      'DELETE',
      `/api/foundation/identity/${String(googleLink?.id)}`,
      adminAgain,
      {
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(googleLink?.updatedAt) },
      },
    )
    expect(plain.status, JSON.stringify(plain.body)).toBe(409)
    expect(plain.body?.code).toBe('second_factor_reset_required')
    expect(probeLink('google', again).count).toBe(1)
    expect((await call(api, 'GET', STAFF_API, googleAgainToken)).status).toBe(200)
    const resetAgain = await call<{ unlinked?: number }>(api, 'POST', RESET, adminAgain, {
      data: { userId: treasurer.userId, note: 'phoned back, Google account lost' },
    })
    expect(resetAgain.status, JSON.stringify(resetAgain.body)).toBe(200)
    expect(resetAgain.body?.unlinked).toBe(1)
    expect(probeLink('google', again).count).toBe(0)
    expect((await call(api, 'GET', STAFF_API, googleAgainToken)).status).toBe(401)
    await challenged(api, treasurer.email, treasurer.password)
  } finally {
    await api.dispose()
    if (other) await other.cleanup()
    await club.cleanup()
  }
})
