// Command interceptors of the foundation. `foundation.password-check` (#779, spec 2026-11-26-vereino-password-check,
// REQ-PW01): every new password that reaches the platform's user commands — `POST`/`PUT /api/auth/users` and
// `PUT /api/auth/profile` — passes the Vereino password check first; a refusal answers 422 with its code and nothing is
// stored. No `features`: it applies to every caller, the super administrator included.
import type { CommandInterceptor } from '@open-mercato/shared/lib/commands/command-interceptor'
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

export const interceptors: CommandInterceptor[] = [passwordCheck('auth.users.create'), passwordCheck('auth.users.update')]
