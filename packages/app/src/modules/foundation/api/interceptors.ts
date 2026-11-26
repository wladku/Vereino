// API interceptors of `foundation` (UMES; `.ai/guides/extensions.md` → API Interceptors).
//
// `foundation.staff-session` (S8.5, ENG-Q-12; #737): after a successful `POST /api/auth/login` of a staff account
// (`isStaffAccount`: any role outside the member-session roles), the new session row expires after the staff idle
// timeout instead of the platform's 8 hours or `REMEMBER_ME_DAYS`, and the long-lived refresh token of "remember me" is
// dropped from the answer, so the platform sets no 30-day `session_token` cookie. A member account keeps the platform
// lifetime. Fails closed: when the session cannot be narrowed the interceptor throws and the platform answers 500
// without setting the session cookies.
import { verifyJwt } from '@open-mercato/shared/lib/auth/jwt'
import type { ApiInterceptor } from '@open-mercato/shared/lib/crud/api-interceptor'
import { limitStaffSessionAtSignIn } from '../services/staff-session'

type SignedInClaims = { sub: string; sid: string; roles: string[] }

function signedInClaims(body: Record<string, unknown>): SignedInClaims | null {
  const token = body.token
  if (typeof token !== 'string' || token === '') return null
  const payload = verifyJwt(token)
  if (!payload || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null
  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((role): role is string => typeof role === 'string')
    : []
  return { sub: payload.sub, sid: payload.sid, roles }
}

const staffSessionInterceptor: ApiInterceptor = {
  id: 'foundation.staff-session',
  targetRoute: 'auth/login',
  methods: ['POST'],
  priority: 10,
  timeoutMs: 5_000,
  async after(_request, response, context) {
    if (response.statusCode !== 200) return {}
    const claims = signedInClaims(response.body)
    if (!claims) return {}
    const em = context.em.fork()
    const limited = await limitStaffSessionAtSignIn(em, {
      sessionId: claims.sid,
      userId: claims.sub,
      roles: claims.roles,
    })
    return limited ? { merge: { refreshToken: undefined } } : {}
  },
}

export const interceptors: ApiInterceptor[] = [staffSessionInterceptor]

export default interceptors
