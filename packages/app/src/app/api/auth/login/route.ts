import { bootstrap } from '@/bootstrap-api'
import { POST as loginPost } from '@open-mercato/core/modules/auth/api/login'
import { SIGN_IN_EMAIL_LIMIT, withAccountEmailLimit } from '@/modules/foundation'
export { metadata, openApi } from '@open-mercato/core/modules/auth/api/login'

bootstrap()

// Vereino local patch (#738): sign-in attempts for one account from any number of clients are limited before the
// platform handler, which counts per client and per client and address only. A successful sign-in clears the count.
export function POST(request: Request): Promise<Response> {
  return withAccountEmailLimit(request, SIGN_IN_EMAIL_LIMIT, loginPost, { resetOnSuccess: true })
}
