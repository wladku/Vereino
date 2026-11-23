// P-07 createAccount (V-2): the platform owns users and invitations, so an account is created only through the
// command `auth.users.create` with `sendInviteEmail: true`. The calling `people` command applies
// `accountAgePolicy` first, throws its own codes and stores the returned `userId` on the person. `accountEmail` reads
// the login e-mail of such an account for the person record's "Account" tab (#84).
// People life-cycle spec phase L1 (REQ-L01, REQ-L02, DD-L02; #303): `accountView` reads the account state from the
// platform user, never storing it; `resendInvitation` is the V-L01 fallback approved on 2026-11-16 — the platform's
// `authService.requestPasswordReset` and its reset e-mail, a 60-minute link; `updateAccount` and `closeAccount` run
// the platform commands `auth.users.update` (`email`, `isConfirmed`) and `auth.users.delete`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { PasswordReset, User } from '@open-mercato/core/modules/auth/data/entities'
import InviteUserEmail from '@open-mercato/core/modules/auth/emails/InviteUserEmail'
import ResetPasswordEmail from '@open-mercato/core/modules/auth/emails/ResetPasswordEmail'
import { INVITE_TOKEN_TTL_MS } from '@open-mercato/core/modules/auth/lib/inviteToken'
import { withTenantHintUrl } from '@open-mercato/core/modules/auth/lib/tenantHint'
import { generateAuthToken, hashAuthToken } from '@open-mercato/core/modules/auth/lib/tokenHash'
import type { AuthService } from '@open-mercato/core/modules/auth/services/authService'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getSecurityEmailBaseUrl } from '@open-mercato/shared/lib/url'
import { accountState, type AccountState } from '@vereino/core'
import { foundationErrors } from '../api/errors'
import { emailSender } from './email-sender'
import { renderLocalized } from './localized'

const logger = createLogger('foundation').child({ component: 'accounts' })

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

/**
 * The login e-mail of the platform user `userId`, or null when the user is gone or belongs to another tenant or
 * organization than `scope` (fail closed: an id stored on a record never reads a user outside its club).
 */
export async function accountEmail(
  container: AwilixContainer,
  scope: { tenantId: string; organizationId: string },
  userId: string,
): Promise<string | null> {
  const user = await scopedUser(container, scope, userId)
  return user?.email ?? null
}

type AccountScope = { tenantId: string; organizationId: string }

/** The live platform user `userId` inside `scope`, or null (gone, or of another tenant or organization). */
async function scopedUser(container: AwilixContainer, scope: AccountScope, userId: string): Promise<User | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return findOneWithDecryption(
    em,
    User,
    { id: userId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
    {},
    scope,
  )
}

/** The account of a person as the "Account" tab reads it (`GET /api/people/persons/{id}` → `account`). */
export type AccountView = {
  state: AccountState
  /** The login e-mail; null without an account in the club's scope. */
  email: string | null
  /** When the platform user was created (the first invitation). */
  invitedAt: string | null
  lastSignInAt: string | null
}

const NO_ACCOUNT: AccountView = { state: 'none', email: null, invitedAt: null, lastSignInAt: null }

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * The state of the account `userId` (DD-L02): read from the platform user, never stored. A missing id, a deleted user
 * and a user outside the club's tenant and organization all read as `none` (fail closed, as `accountEmail` does).
 */
export async function accountView(
  container: AwilixContainer,
  scope: AccountScope,
  userId: string | null | undefined,
): Promise<AccountView> {
  if (!userId) return NO_ACCOUNT
  const user = await scopedUser(container, scope, userId)
  if (!user) return NO_ACCOUNT
  const lastSignInAt = user.lastLoginAt ?? null
  return {
    state: accountState({
      hasPassword: Boolean(user.passwordHash),
      lastSignInAt,
      isConfirmed: user.isConfirmed,
    }),
    email: user.email,
    invitedAt: isoOrNull(user.createdAt),
    lastSignInAt: isoOrNull(lastSignInAt),
  }
}

export type ResendInvitationResult = {
  sentAt: string
  /** The link exists but the e-mail failed; the action stays available. */
  warning?: 'invite_email_failed'
}

/**
 * Sends the invitation again (REQ-L01) through the V-L01 fallback: a new password-reset link of the platform
 * (`authService.requestPasswordReset`, valid 60 minutes) in the platform's reset e-mail, with copy that says it is the
 * club's invitation and names the 60 minutes. Earlier unused links stay valid until they expire. The caller checks the
 * account state first; a user outside `scope` answers `scope_denied`. The platform looks the user up by e-mail across
 * tenants, so a link created for another user with the same address is never sent and the result is a warning.
 */
export async function resendInvitation(
  ctx: CommandRuntimeContext,
  scope: AccountScope,
  userId: string,
): Promise<ResendInvitationResult> {
  const user = await scopedUser(ctx.container, scope, userId)
  if (!user) return foundationErrors.throw('scope_denied')
  const base = getSecurityEmailBaseUrl(ctx.request ?? undefined)
  const sentAt = new Date().toISOString()
  const authService = ctx.container.resolve<AuthService>('authService')
  const reset = await authService.requestPasswordReset(user.email)
  if (!reset || reset.user.id !== user.id) {
    logger.warn('The password reset did not resolve to the invited user; no e-mail sent', { userId: user.id })
    return { sentAt, warning: 'invite_email_failed' }
  }
  const resetUrl = withTenantHintUrl(`${base}/reset/${reset.token}`, user.tenantId)
  const { translate } = await resolveTranslations()
  const copy = {
    preview: translate('foundation.account.invitation.preview', 'Set up your account'),
    title: translate('foundation.account.invitation.title', 'Your invitation, sent again'),
    body: translate(
      'foundation.account.invitation.body',
      'Your club sent your invitation again. Click the link below to set your password. This link will expire in 60 minutes.',
    ),
    cta: translate('foundation.account.invitation.cta', 'Set up your password'),
    hint: translate(
      'foundation.account.invitation.hint',
      'If you did not expect this invitation, you can safely ignore this e-mail.',
    ),
  }
  try {
    await emailSender(ctx.container).send({
      to: user.email,
      subject: translate('foundation.account.invitation.subject', 'Your invitation, sent again'),
      // Called, not `createElement`-ed, as the platform reset route does: the e-mail capture of test mode and the
      // link extraction read the expanded tree.
      react: ResetPasswordEmail({ resetUrl, copy }),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
  } catch (error: unknown) {
    logger.error('Failed to send the invitation again', { err: error, userId: user.id })
    return { sentAt, warning: 'invite_email_failed' }
  }
  return { sentAt }
}

export type AccountInvitationResult = {
  /** When the link stops working (the platform's invitation lifetime, 48 hours). */
  expiresAt: string
  /** The link exists but the e-mail failed; the operator sends it again. */
  warning?: 'invite_email_failed'
}

/**
 * Invites the first administrator of a club the operator created (many clubs spec J-M01 step 3; #630): the platform's
 * own invitation — a one-time link to set the password, valid 48 hours (`INVITE_TOKEN_TTL_MS`), stored only as its
 * hash, the same row the platform's "Resend invite" writes — sent in the club's name. The link is tied to the user
 * row, not looked up by e-mail, so it reaches this user even when the address has an account in another club; earlier
 * unused links of the user stop working. Rendered in `locale` (the club's language). No password is ever set or shown
 * by the operator. A user outside `scope` answers `scope_denied`.
 */
export async function sendAccountInvitation(
  container: AwilixContainer,
  scope: AccountScope,
  userId: string,
  clubName: string,
  locale: string | null,
): Promise<AccountInvitationResult> {
  const em = container.resolve<EntityManager>('em').fork()
  const user = await findOneWithDecryption(
    em,
    User,
    { id: userId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
    {},
    scope,
  )
  if (!user) return foundationErrors.throw('scope_denied')
  const rawToken = generateAuthToken()
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS)
  // As the platform's "Resend invite": every earlier unused link stops working, so only the newest one sets the password.
  await em.nativeUpdate(PasswordReset, { user: user.id, usedAt: null }, { usedAt: new Date() })
  await em
    .persist(em.create(PasswordReset, { user, token: hashAuthToken(rawToken), expiresAt, createdAt: new Date() }))
    .flush()
  const inviteUrl = withTenantHintUrl(`${getSecurityEmailBaseUrl()}/reset/${rawToken}`, user.tenantId)
  const params = { club: clubName }
  // The CLI has no request, so the club's language is passed explicitly (P-16).
  const { subject, copy } = await renderLocalized(locale, (translate) => ({
    subject: translate('foundation.account.clubInvitation.subject', 'Your invitation to {club}', params),
    copy: {
      preview: translate('foundation.account.clubInvitation.preview', 'Set up your account', params),
      title: translate('foundation.account.clubInvitation.title', 'You are the administrator of {club}', params),
      body: translate(
        'foundation.account.clubInvitation.body',
        'An account was created for you as the administrator of {club}. Click the link below to set your password. This link will expire in 48 hours.',
        params,
      ),
      cta: translate('foundation.account.clubInvitation.cta', 'Set up your password', params),
      hint: translate(
        'foundation.account.clubInvitation.hint',
        'If you did not expect this invitation, you can safely ignore this e-mail.',
        params,
      ),
    },
  }))
  try {
    await emailSender(container).send({
      to: user.email,
      subject,
      // Called, not `createElement`-ed, as the platform does: the e-mail capture of test mode reads the expanded tree.
      react: InviteUserEmail({ inviteUrl, copy }),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
  } catch (error: unknown) {
    logger.error('Failed to send the club administrator invitation', { err: error, userId: user.id })
    return { expiresAt: expiresAt.toISOString(), warning: 'invite_email_failed' }
  }
  return { expiresAt: expiresAt.toISOString() }
}

export type UpdateAccountInput = { email?: string; blocked?: boolean }

/**
 * Changes the login e-mail and/or blocks (`isConfirmed = false`, which ends the user's sessions and refuses sign-in)
 * or unblocks the platform user through `auth.users.update`; roles and data stay. A duplicate e-mail in the tenant
 * becomes 409 `email_taken`.
 */
export async function updateAccount(
  ctx: CommandRuntimeContext,
  userId: string,
  input: UpdateAccountInput,
): Promise<void> {
  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  try {
    await commandBus.execute('auth.users.update', {
      input: {
        id: userId,
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.blocked !== undefined ? { isConfirmed: !input.blocked } : {}),
      },
      ctx,
    })
  } catch (error: unknown) {
    if (isDuplicateEmailError(error)) return foundationErrors.throw('email_taken')
    throw error
  }
}

/**
 * Deletes the platform user through `auth.users.delete`, which removes its sessions, role links, ACL and pending
 * reset links in one transaction (people life-cycle spec *Closing an account*).
 */
export async function closeAccount(ctx: CommandRuntimeContext, userId: string): Promise<void> {
  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  await commandBus.execute('auth.users.delete', { input: { id: userId }, ctx })
}
