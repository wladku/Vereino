// `POST /api/auth/reset` (#738): the platform password-reset request behind Vereino's per-account limit — 3 requests
// per hour for one address from any number of clients (S8.6 personal-link request); the platform counts per client and
// per client and address only. Same pattern as `../login/route.ts`: a Next route in front of the platform handler,
// which keeps its own limits, validation and uniform answer.
import { bootstrap } from '@/bootstrap-api'
import { POST as resetPost } from '@open-mercato/core/modules/auth/api/reset'
import { PASSWORD_RESET_EMAIL_LIMIT, withAccountEmailLimit } from '@/modules/foundation'
export { metadata, openApi } from '@open-mercato/core/modules/auth/api/reset'

bootstrap()

export function POST(request: Request): Promise<Response> {
  return withAccountEmailLimit(request, PASSWORD_RESET_EMAIL_LIMIT, resetPost)
}
