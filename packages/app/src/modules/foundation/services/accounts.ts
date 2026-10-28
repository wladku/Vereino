// P-07 createAccount (V-2): the platform owns users and invitations, so an account is created only through the
// command `auth.users.create` with `sendInviteEmail: true`. The calling `people` command applies
// `accountAgePolicy` first, throws its own codes and stores the returned `userId` on the person.
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { foundationErrors } from '../api/errors'

export type CreateAccountInput = {
  email: string
  /** The full `auth` role list, usually `desiredRoles(...)` of the person. */
  roles: readonly string[]
  /** Display name of the user. */
  name?: string | null
}

export type CreateAccountResult = {
  userId: string
  /** The account exists but the invitation e-mail failed; the UI offers "Resend" (`api/users/resend-invite`). */
  warning?: 'invite_email_failed'
}

type CreateUserCommandResult = { user: { id: string }; warning?: 'invite_email_failed' }

/** The platform rejects an e-mail already used in the tenant with a 400 whose detail is `email` / `duplicate`. */
function isDuplicateEmailError(error: unknown): boolean {
  if (!isCrudHttpError(error) || error.status !== 400) return false
  const details: unknown = error.body.details
  if (!Array.isArray(details)) return false
  return details.some((detail: unknown) => {
    const { path, code } = (detail ?? {}) as { path?: unknown; code?: unknown }
    return code === 'duplicate' && Array.isArray(path) && path[0] === 'email'
  })
}

/**
 * Creates the user in the organization of `ctx` (the session's selected organization) and sends the
 * invitation. The platform renders the invitation in the locale of the current request (`resolveTranslations`);
 * the command has no locale input. A duplicate e-mail becomes 409 `email_taken`.
 */
export async function createAccount(
  input: CreateAccountInput,
  ctx: CommandRuntimeContext,
): Promise<CreateAccountResult> {
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (!organizationId || ctx.organizationScope?.selectionRejected) return foundationErrors.throw('scope_denied')
  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  try {
    const { result } = await commandBus.execute<Record<string, unknown>, CreateUserCommandResult>('auth.users.create', {
      input: {
        email: input.email,
        ...(input.name !== undefined ? { name: input.name } : {}),
        organizationId,
        roles: [...input.roles],
        sendInviteEmail: true,
      },
      ctx,
    })
    return { userId: result.user.id, ...(result.warning ? { warning: result.warning } : {}) }
  } catch (error: unknown) {
    if (isDuplicateEmailError(error)) return foundationErrors.throw('email_taken')
    throw error
  }
}
