// `GET`, `PUT /api/auth/profile` (#779, spec 2026-11-26-vereino-password-check, REQ-PW03): the platform's profile
// handler, with the current password checked exactly as typed. The platform trims `currentPassword` before it compares
// it, so `secret ` would pass as `secret`; a current password with a space at either end is answered here as incorrect,
// with the platform's own body. The new password itself is checked by the `foundation.password-check` command
// interceptor. Same pattern as `../login/route.ts`: a Next route in front of the platform handler.
//
// #876: a successful change of one's own password keeps this device signed in. The platform's user update deletes all
// of the user's sessions and its answer carries a JWT naming the deleted one, so the member (and the administrator on
// the panel page) was signed out at the next request; `renewOwnSession` issues a fresh session for this device and
// its cookies replace the platform's. Every other session stays ended. Without a session the platform's answer stays.
import { NextResponse } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { renewOwnSession, setSessionCookies } from '@/modules/foundation'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { GET, PUT as profilePut } from '@open-mercato/core/modules/auth/api/profile/route'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
export { metadata, openApi } from '@open-mercato/core/modules/auth/api/profile/route'

bootstrap()

const logger = createLogger('foundation').child({ component: 'own-password' })

export { GET }

export async function PUT(request: Request): Promise<Response> {
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null)
  const currentPassword = (body as { currentPassword?: unknown } | null)?.currentPassword
  if (typeof currentPassword === 'string' && currentPassword !== currentPassword.trim()) {
    const auth = await getAuthFromRequest(request)
    if (auth?.sub) {
      const { translate } = await resolveTranslations()
      const message = translate('auth.profile.form.errors.currentPasswordInvalid', 'Current password is incorrect.')
      return NextResponse.json({ error: message, issues: [{ path: ['currentPassword'], message }] }, { status: 400 })
    }
  }
  // Read before the change: the platform deletes the session this request names.
  const changesPassword = typeof (body as { password?: unknown } | null)?.password === 'string'
  const auth = changesPassword ? await getAuthFromRequest(request) : null
  const response = await profilePut(request)
  if (response.status !== 200 || !auth?.sub) return response
  try {
    const container = await createRequestContainer()
    const issued = await renewOwnSession(container, auth)
    if (issued) setSessionCookies(response, issued)
  } catch (error: unknown) {
    logger.warn('Session not renewed after the password change; the device signs in again', { err: error })
  }
  return response
}
