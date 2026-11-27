// The completion of a second-factor challenge (staff second factor spec *API, Command, and Error Contracts*; #736):
// `verify` checks the code and swaps the provisional session for a fresh full one; `resend` mails a new code. Both run
// under the challenge's advisory lock (DD-2F08) and accept only a provisional token whose marker matches its user,
// session, tenant and organization. The platform's MFA-pending gate lets the token reach these two routes only
// (`second-factor/routes.ts`), and its canonical check needs the challenged session alive (V-2F01).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { NextResponse } from 'next/server'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { verifyJwt } from '@open-mercato/shared/lib/auth/jwt'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { emitFoundationEvent } from '../../events'
import {
  SECOND_FACTOR_METHOD,
  afterWrongCode,
  codeMatches,
  markerMatches,
  newCode,
  nextResendAt,
  normalizeCode,
  readProvisionalClaims,
  resendDecision,
  type ChallengeMarker,
  type ProvisionalClaims,
} from '../../lib/second-factor'
import { clearSessionCookies, issueUserSession, setSessionCookies } from '../session-issuer'
import {
  SecondFactorUnavailable,
  deleteChallenge,
  endPlatformSession,
  readChallenge,
  reportSecondFactor,
  sendCodeEmail,
  storeChallenge,
  withChallengeLock,
} from './challenge'
import { secondFactorRefusal } from './gate'

function tokenOf(request: Request): string | null {
  const header = (request.headers.get('authorization') ?? '').trim()
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || null
  const match = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)auth_token=([^;]+)/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

/** The provisional claims of the request's token, or null (a full token, no token, a forged one). */
export function provisionalClaimsOf(request: Request): ProvisionalClaims | null {
  const token = tokenOf(request)
  if (!token) return null
  try {
    return readProvisionalClaims(verifyJwt(token))
  } catch {
    return null
  }
}

async function expired(): Promise<NextResponse> {
  const response = await secondFactorRefusal('second_factor_challenge_expired')
  clearSessionCookies(response)
  return response
}

async function challengedUser(container: AwilixContainer, marker: ChallengeMarker): Promise<User | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const scope = { tenantId: marker.tenantId, organizationId: marker.organizationId }
  const user = await findOneWithDecryption(em, User, { id: marker.userId, ...scope, deletedAt: null }, {}, scope)
  return user?.isConfirmed === false ? null : user
}

function eventPayload(marker: ChallengeMarker) {
  return {
    id: marker.userId,
    userId: marker.userId,
    tenantId: marker.tenantId,
    organizationId: marker.organizationId,
    method: SECOND_FACTOR_METHOD,
  }
}

type Live = { container: AwilixContainer; claims: ProvisionalClaims; marker: ChallengeMarker }

/** Runs `work` with the live marker of the request's challenge under its lock; else the expired or 503 answer. */
async function withLiveChallenge(request: Request, work: (live: Live) => Promise<Response>): Promise<Response> {
  const claims = provisionalClaimsOf(request)
  if (!claims) return expired()
  const container = await createRequestContainer()
  try {
    return await withChallengeLock(container, claims.challengeId, async () => {
      const marker = await readChallenge(container, claims.challengeId)
      if (!marker || !markerMatches(marker, claims, Date.now())) {
        // The token's own session is a provisional one by construction: nothing may use it any more.
        await endPlatformSession(container, claims.sid)
        return expired()
      }
      return work({ container, claims, marker })
    })
  } catch (error: unknown) {
    if (error instanceof SecondFactorUnavailable) return secondFactorRefusal('second_factor_unavailable')
    throw error
  }
}

/** `POST /api/foundation/second-factor/verify`. */
export async function verifySecondFactor(request: Request): Promise<Response> {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const code = normalizeCode((body as { code?: unknown } | null)?.code)
  if (!code) return secondFactorRefusal('second_factor_code_invalid')
  return withLiveChallenge(request, async ({ container, claims, marker }) => {
    if (!codeMatches(claims.challengeId, code, marker.codeHash)) {
      const wrong = afterWrongCode(marker)
      if (wrong.locked) {
        await deleteChallenge(container, claims.challengeId)
        await endPlatformSession(container, marker.sessionId)
        reportSecondFactor('foundation.second_factor.locked', { userId: marker.userId })
        void emitFoundationEvent('foundation.second_factor.locked', eventPayload(marker)).catch(() => undefined)
        return expired()
      }
      await storeChallenge(container, claims.challengeId, wrong.marker)
      return secondFactorRefusal('second_factor_code_invalid', { attemptsLeft: wrong.attemptsLeft })
    }
    // Single use: the marker and the provisional session go before the full session is issued.
    await deleteChallenge(container, claims.challengeId)
    await endPlatformSession(container, marker.sessionId)
    const user = await challengedUser(container, marker)
    if (!user) return expired()
    const issued = await issueUserSession(container, user, marker, { remember: marker.remember })
    void emitFoundationEvent('foundation.second_factor.verified', eventPayload(marker)).catch(() => undefined)
    const response = NextResponse.json({ ok: true, token: issued.token, redirect: marker.redirect })
    setSessionCookies(response, issued)
    response.headers.set('Cache-Control', 'no-store')
    return response
  })
}

/** `POST /api/foundation/second-factor/resend`. */
export async function resendSecondFactor(request: Request): Promise<Response> {
  return withLiveChallenge(request, async ({ container, claims, marker }) => {
    const code = newCode()
    const decision = resendDecision(marker, claims.challengeId, code, Date.now())
    if (!decision.allowed) {
      const details = decision.nextResendAt ? { nextResendAt: new Date(decision.nextResendAt).toISOString() } : {}
      return secondFactorRefusal('second_factor_resend_limited', details)
    }
    const user = await challengedUser(container, marker)
    if (!user) return expired()
    await sendCodeEmail(container, {
      to: user.email,
      code,
      tenantId: marker.tenantId,
      organizationId: marker.organizationId,
    })
    await storeChallenge(container, claims.challengeId, decision.marker)
    return NextResponse.json(
      {
        ok: true,
        expiresAt: new Date(decision.marker.expiresAt).toISOString(),
        nextResendAt: new Date(nextResendAt(decision.marker)).toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })
}
