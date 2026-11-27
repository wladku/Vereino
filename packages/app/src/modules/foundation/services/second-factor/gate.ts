// The second-factor gate of the password sign-in (staff second factor spec DD-2F01…DD-2F05; #736). The Vereino login
// wrapper (`src/app/api/auth/login/route.ts`, #738) calls it around the platform's handler. After the platform's 200 it
// asks RBAC whether the user holds `foundation.second_factor.required`; if so it never lets the platform's cookies or
// `refreshToken` through: it opens a challenge for the platform's session, e-mails the code and answers with a
// provisional `mfa_pending` token for that same session (V-2F01: the platform refuses it everywhere but the two
// completion routes). Every refusal deletes the platform session first (fail closed, REQ-2F05). Phase 2 (#841, DD-2F06,
// Q-2F01): a required user with a Google identity link must sign in with Google, so the password is refused with
// `second_factor_use_google` while Google sign-in is enabled (with it disabled the e-mail code stays the way in).
import { NextResponse } from 'next/server'
import { signJwt, verifyJwt } from '@open-mercato/shared/lib/auth/jwt'
import { parseBooleanToken } from '@open-mercato/shared/lib/boolean'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { foundationErrors } from '../../api/errors'
import { emitFoundationEvent } from '../../events'
import { identityProviderConfig } from '../../lib/identity'
import {
  CHALLENGE_TTL_MS,
  SECOND_FACTOR_METHOD,
  SECOND_FACTOR_PAGE,
  challengeLimit,
  emailHint,
  hashCode,
  newChallengeId,
  newCode,
  provisionalTokenClaims,
  readIssuedClaims,
  type ChallengeMarker,
} from '../../lib/second-factor'
import type { FoundationErrorCode } from '../../lib/error-codes'
import { ownLinkCount } from '../identity-links'
import { sessionlessRateLimiter } from '../sessionless-limits'
import {
  SecondFactorUnavailable,
  deleteChallenge,
  endPlatformSession,
  reportSecondFactor,
  sendCodeEmail,
  storeChallenge,
} from './challenge'
import { holdsSecondFactorRequirement } from './requirement'

/** The marker on a gate answer that tells the wrapper not to clear the account's sign-in counter. */
export const PROVISIONAL_HEADER = 'x-vereino-second-factor'

/** The coded refusal of the gate, without any session cookie. */
export async function secondFactorRefusal(code: FoundationErrorCode, details?: Record<string, unknown>) {
  const error = await foundationErrors.create(code, details)
  const response = NextResponse.json(error.body, { status: error.status })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

async function rememberOf(request: Request): Promise<boolean> {
  try {
    const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (type === 'application/x-www-form-urlencoded') {
      return parseBooleanToken(new URLSearchParams(await request.text()).get('remember')) === true
    }
    const form = await request.formData()
    const remember = form.get('remember')
    return typeof remember === 'string' && parseBooleanToken(remember) === true
  } catch {
    return false
  }
}

/** Google sign-in is enabled (a client id and secret are configured); the gate reads it without the OAuth client. */
function googleEnabled(): boolean {
  return (
    identityProviderConfig('google', process.env, process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || null) !==
    null
  )
}

/** The hourly per-user cap: true when allowed; a limiter that could not count refuses (fail closed). */
async function challengeAllowed(request: Request, userId: string): Promise<boolean | 'unavailable'> {
  const limiter = await sessionlessRateLimiter(request)
  if (!limiter) return true
  const limit = challengeLimit(userId)
  const result = await limiter.consume(limit.key, limit.config)
  if (result.degraded) {
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'challenge_limit' })
    return 'unavailable'
  }
  return result.allowed
}

/**
 * Runs the platform's sign-in `handler` and applies the gate to its answer. A non-200 answer, and a 200 for a user
 * without the requirement, pass unchanged.
 */
export async function withSecondFactor(
  request: Request,
  handler: (request: Request) => Promise<Response>,
): Promise<Response> {
  const remember = await rememberOf(request.clone())
  const response = await handler(request)
  if (response.status !== 200) return response
  let body: { token?: unknown; redirect?: unknown }
  try {
    body = (await response.clone().json()) as typeof body
  } catch {
    return response
  }
  const payload = typeof body.token === 'string' ? verifyJwt(body.token) : null
  const sub = typeof payload?.sub === 'string' ? payload.sub : null
  const sid = typeof payload?.sid === 'string' ? payload.sid : null
  if (!payload || !sub || !sid) return response

  const container = await createRequestContainer()
  const scope = {
    tenantId: typeof payload.tenantId === 'string' ? payload.tenantId : null,
    organizationId: typeof payload.orgId === 'string' ? payload.orgId : null,
  }
  let required: boolean
  try {
    required = await holdsSecondFactorRequirement(container, sub, scope)
  } catch (error: unknown) {
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'requirement', err: error })
    await endPlatformSession(container, sid)
    return secondFactorRefusal('second_factor_unavailable')
  }
  if (!required) return response

  const issued = readIssuedClaims(payload)
  const email = typeof payload.email === 'string' ? payload.email : null
  if (!issued || !email) {
    // A required user without a tenant, an organization or an address cannot be challenged: no session.
    reportSecondFactor('foundation.second_factor.unavailable', { step: 'claims' })
    await endPlatformSession(container, sid)
    return secondFactorRefusal('second_factor_unavailable')
  }

  // Phase 2 (DD-2F06): a connected Google account is the only way in; the e-mail code would be the weaker path.
  if (googleEnabled()) {
    let linked: number
    try {
      linked = await ownLinkCount(container, { tenantId: issued.tenantId, organizationId: issued.orgId }, sub, 'google')
    } catch (error: unknown) {
      reportSecondFactor('foundation.second_factor.unavailable', { step: 'google_link', err: error })
      await endPlatformSession(container, sid)
      return secondFactorRefusal('second_factor_unavailable')
    }
    if (linked > 0) {
      await endPlatformSession(container, sid)
      return secondFactorRefusal('second_factor_use_google')
    }
  }

  const allowed = await challengeAllowed(request, sub)
  if (allowed !== true) {
    await endPlatformSession(container, sid)
    return secondFactorRefusal(allowed === false ? 'second_factor_challenges_limited' : 'second_factor_unavailable')
  }

  const challengeId = newChallengeId()
  const code = newCode()
  const now = Date.now()
  const marker: ChallengeMarker = {
    userId: sub,
    sessionId: sid,
    tenantId: issued.tenantId,
    organizationId: issued.orgId,
    codeHash: hashCode(challengeId, code),
    attempts: 0,
    resends: 0,
    lastSentAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
    remember,
    redirect: typeof body.redirect === 'string' && body.redirect ? body.redirect : '/backend',
  }
  try {
    await storeChallenge(container, challengeId, marker)
    try {
      await sendCodeEmail(container, { to: email, code, tenantId: issued.tenantId, organizationId: issued.orgId })
    } catch (error: unknown) {
      await deleteChallenge(container, challengeId)
      throw error
    }
  } catch (error: unknown) {
    await endPlatformSession(container, sid)
    if (error instanceof SecondFactorUnavailable) return secondFactorRefusal('second_factor_unavailable')
    throw error
  }

  void emitFoundationEvent('foundation.second_factor.challenged', {
    id: sub,
    userId: sub,
    tenantId: issued.tenantId,
    organizationId: issued.orgId,
    method: SECOND_FACTOR_METHOD,
  }).catch(() => undefined)

  const token = signJwt(provisionalTokenClaims(issued, challengeId), { expiresInSec: CHALLENGE_TTL_MS / 1000 })
  const answer = NextResponse.json({
    ok: true,
    token,
    redirect: SECOND_FACTOR_PAGE,
    secondFactor: {
      method: SECOND_FACTOR_METHOD,
      expiresAt: new Date(marker.expiresAt).toISOString(),
      emailHint: emailHint(email),
    },
  })
  const cookie = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  }
  answer.cookies.set('auth_token', token, { ...cookie, maxAge: CHALLENGE_TTL_MS / 1000 })
  answer.cookies.set('session_token', '', { ...cookie, maxAge: 0 })
  answer.headers.set('Cache-Control', 'no-store')
  answer.headers.set(PROVISIONAL_HEADER, 'challenge')
  return answer
}
