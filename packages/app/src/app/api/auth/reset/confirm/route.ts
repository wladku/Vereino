// `POST /api/auth/reset/confirm` (#779, spec 2026-11-26-vereino-password-check, REQ-PW01): the platform's
// set-a-new-password handler behind the Vereino password check. The reset and invitation links carry no session, so the
// check uses the product words only (Q5); the platform handler keeps its own rate limit, token check and policy. Same
// pattern as `../../login/route.ts`: a Next route in front of the platform handler.
import { NextResponse } from 'next/server'
import { bootstrap } from '@/bootstrap-api'
import { POST as confirmPost } from '@open-mercato/core/modules/auth/api/reset/confirm'
import { passwordRefusalError, refuseNewPassword } from '@/modules/foundation'
export { metadata, openApi } from '@open-mercato/core/modules/auth/api/reset/confirm'

bootstrap()

export async function POST(request: Request): Promise<Response> {
  const form = await request
    .clone()
    .formData()
    .catch(() => null)
  const password = form?.get('password')
  if (typeof password === 'string' && password.length > 0) {
    const refusal = await refuseNewPassword(password)
    if (refusal) {
      const error = await passwordRefusalError(refusal)
      return NextResponse.json({ ok: false, ...error.body }, { status: error.status })
    }
  }
  return confirmPost(request)
}
