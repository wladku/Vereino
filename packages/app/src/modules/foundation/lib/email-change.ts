// The confirmation mark of an own e-mail change (ENG-Q-12, #737). `PUT /api/foundation/profile/email` checks the current
// password, then runs `auth.users.update` with the session's auth context marked for that e-mail; the command
// interceptor `foundation.email-change-confirmation` lets an own e-mail change through only with the mark. The mark is
// a symbol key on the in-process auth object: a request, a JWT claim or a command input cannot carry it (JSON has no
// symbols). It is a registered symbol (`Symbol.for`) because the route and the interceptor end up in different server
// bundles, each with its own copy of this module; a plain `Symbol()` differed between them (TEST-737, first run).
import { normalizeLoginEmail } from '@vereino/core'

const EMAIL_CHANGE_CONFIRMED = Symbol.for('vereino.foundation.emailChangeConfirmed')

type Markable = Record<PropertyKey, unknown>

/** A copy of `auth` marked as confirmed (by the current password) for a change to `email`. */
export function markEmailChangeConfirmed<T extends object>(auth: T, email: string): T {
  return { ...auth, [EMAIL_CHANGE_CONFIRMED]: normalizeLoginEmail(email) }
}

/** Whether `auth` carries the confirmation mark for exactly `email`. */
export function isEmailChangeConfirmed(auth: unknown, email: string): boolean {
  if (!auth || typeof auth !== 'object') return false
  return (auth as Markable)[EMAIL_CHANGE_CONFIRMED] === normalizeLoginEmail(email)
}
