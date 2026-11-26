import { bootstrap } from '@/bootstrap-api'
import { POST as loginPost } from '@open-mercato/core/modules/auth/api/login'
import { SIGN_IN_EMAIL_LIMIT, withAccountEmailLimit } from '@/modules/foundation'
// Imported from its file, not the module index: the gate pulls in `next/server`, which plain-Node loaders of the index
// (the CLI, the generated registries) cannot resolve.
import { PROVISIONAL_HEADER, withSecondFactor } from '@/modules/foundation/second-factor/gate'
export { metadata, openApi } from '@open-mercato/core/modules/auth/api/login'

bootstrap()

// Vereino local patch (#738): sign-in attempts for one account from any number of clients are limited before the
// platform handler, which counts per client and per client and address only. A finished sign-in clears the count.
//
// Vereino local patch (#736, staff second factor DD-2F01): a user holding `foundation.second_factor.required` gets no
// session from a password alone. The gate replaces the platform's answer with a provisional `mfa_pending` token and
// e-mails a code; such an answer is not a finished sign-in, so it leaves the account's count as it is.
export function POST(request: Request): Promise<Response> {
  return withAccountEmailLimit(request, SIGN_IN_EMAIL_LIMIT, (inner) => withSecondFactor(inner, loginPost), {
    resetOnSuccess: (response) => !response.headers.has(PROVISIONAL_HEADER),
  })
}
