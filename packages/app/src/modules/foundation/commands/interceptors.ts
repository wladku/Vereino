// Command interceptors of `foundation` (UMES). No `registerCommand` here: `di.ts` may never load a command file.
//
// `foundation.password-check.*` (#779, spec 2026-11-26-vereino-password-check, REQ-PW01): every new password that
// reaches the platform's user commands — `POST`/`PUT /api/auth/users` and `PUT /api/auth/profile` — passes the Vereino
// password check first; a refusal answers 422 with its code and nothing is stored. No `features`: it applies to every
// caller, the super administrator included.
//
// `foundation.email-change-confirmation` (S8.5, ENG-Q-12 answered 2026-11-26; #737): an `auth.users.update` that changes
// the actor's own login e-mail runs only when `PUT /api/foundation/profile/email` confirmed it with the current password
// (`isEmailChangeConfirmed`). Every other own change — the platform's `PUT /api/auth/profile`, the users admin form or
// the person record's account tab on one's own account — is refused with 403 `email_change_confirmation_required`; the
// platform profile route answers that rejection as it is. Changes of another user's e-mail (an administrator's work)
// and updates without an e-mail are untouched.
import { User } from '@open-mercato/core/modules/auth/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandInterceptor } from '@open-mercato/shared/lib/commands/command-interceptor'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isOwnEmailChange } from '@vereino/core'
import { foundationErrors } from '../api/errors'
import { isEmailChangeConfirmed } from '../lib/email-change'
import { passwordContext, passwordRefusalError, refuseNewPassword } from '../services/password-check'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function passwordCheck(targetCommand: 'auth.users.create' | 'auth.users.update'): CommandInterceptor {
  return {
    id: `foundation.password-check.${targetCommand === 'auth.users.create' ? 'create' : 'update'}`,
    targetCommand,
    priority: 10,
    async beforeExecute(input, context) {
      const fields = (input ?? {}) as Record<string, unknown>
      const password = text(fields.password)
      if (!password) return { ok: true }
      const words = await passwordContext(context.container, {
        tenantId: context.auth?.tenantId ?? null,
        userId: targetCommand === 'auth.users.update' ? text(fields.id) : null,
        organizationId: text(fields.organizationId),
        email: text(fields.email),
        name: text(fields.name),
      })
      const refusal = await refuseNewPassword(password, words)
      if (!refusal) return { ok: true }
      const error = await passwordRefusalError(refusal)
      return { ok: false, message: String(error.body.error), status: error.status, body: error.body }
    },
  }
}
const emailChangeConfirmation: CommandInterceptor = {
  id: 'foundation.email-change-confirmation',
  targetCommand: 'auth.users.update',
  priority: 10,
  async beforeExecute(rawInput, context) {
    const auth = context.auth
    const input = (rawInput ?? {}) as { id?: unknown; email?: unknown }
    if (!auth || auth.isApiKey || typeof input.email !== 'string' || input.id !== auth.sub) return { ok: true }
    if (isEmailChangeConfirmed(auth, input.email)) return { ok: true }
    const em = context.container.resolve<EntityManager>('em').fork()
    const user = await findOneWithDecryption(em, User, { id: auth.sub, deletedAt: null }, undefined, {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    })
    const own = isOwnEmailChange({
      actorId: auth.sub,
      targetId: input.id,
      email: input.email,
      storedEmail: user ? user.email : null,
    })
    if (!own) return { ok: true }
    const error = await foundationErrors.create('email_change_confirmation_required')
    return { ok: false, status: error.status, body: error.body, message: String(error.body.error) }
  },
}
export const interceptors: CommandInterceptor[] = [
  passwordCheck('auth.users.create'),
  passwordCheck('auth.users.update'),
  emailChangeConfirmation,
]

export default interceptors
