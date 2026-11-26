// `GET`, `PUT /api/auth/profile` (#779, spec 2026-11-26-vereino-password-check, REQ-PW03): the platform's profile
// handler, with the current password checked exactly as typed. The platform trims `currentPassword` before it compares
// it, so `secret ` would pass as `secret`; a current password with a space at either end is answered here as incorrect,
// with the platform's own body. The new password itself is checked by the `foundation.password-check` command
// interceptor. Same pattern as `../login/route.ts`: a Next route in front of the platform handler.
import { NextResponse } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { GET, PUT as profilePut } from '@open-mercato/core/modules/auth/api/profile/route'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
export { metadata, openApi } from '@open-mercato/core/modules/auth/api/profile/route'

bootstrap()

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
  return profilePut(request)
}
