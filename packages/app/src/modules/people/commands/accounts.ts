// `people.persons.create_account` (foundation spec P-07, J-F01 step 2; club spec *Account*; TEST-F04). The club
// administrator creates the account of a person: the age policy with the club's `own_account_min_age`, then the
// platform account and invitation through the foundation's `createAccount` with the person's desired roles, then
// `people_persons.user_id`, then `people.person.account_created`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { LockMode } from '@mikro-orm/core'
import { accountAgePolicy, type ActingRole } from '@vereino/core'
import {
  accountView,
  authorizeScoped,
  closeAccount,
  createAccount,
  localeForPerson,
  resendInvitation,
  updateAccount,
  type AccountView,
} from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person } from '../data/entities'
import { createAccountSchema, personAccountSchema, updateAccountSchema } from '../data/validators'
import { emitPeopleEvent } from '../events'
import { calendarDateInZone } from '../lib/people-rules'
import { assertAccountWithoutPurpose, assertNotLastClubAdmin } from '../services/account-guards'
import { clubSettings } from '../services/club-clock'
import { desiredRolesForPerson } from '../services/role-sync'
import {
  inWriteTransaction,
  isJobContext,
  loadPersonLocked,
  personEvents,
  personIndexer,
  personTarget,
  sessionOrJob,
} from './shared'

const logger = createLogger('people').child({ component: 'create-account' })

const RESOURCE_KIND = 'people.person'

export type CreateAccountCommandResult = {
  personId: string
  tenantId: string
  organizationId: string
  userId: string
  warning?: 'invite_email_failed'
  actingRole: ActingRole
}

type PreparedAccount = {
  personId: string
  tenantId: string
  organizationId: string
  email: string
  name: string
  roles: string[]
  actingRole: ActingRole
}

/**
 * Not undoable: the platform created the user and sent the invitation e-mail; withdrawing access is the platform's
 * own, separately audited user deactivation, not a reversal of this command.
 */
const createAccountCommand: CommandHandler<Record<string, unknown>, CreateAccountCommandResult> = {
  id: 'people.persons.create_account',
  isUndoable: false,
  async execute(rawInput, ctx) {
    // 1. Scope, the existing-account check and the age policy, under the person's row lock; nothing is written.
    const prepared = await inWriteTransaction<PreparedAccount>(
      ctx,
      'people.persons.create_account.check',
      async (em) => {
        const authorized = await authorizeScoped(
          {
            input: createAccountSchema,
            resourceKind: RESOURCE_KIND,
            // A job context: the invitation after the accept of an application (#800).
            ...sessionOrJob(ctx, ['club_admin'] as const),
            loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock, isJobContext(ctx)),
            resolveTarget: (_parsed, entity) => personTarget(entity as Person),
            lock: 'none',
          },
          rawInput,
          ctx,
          em,
        )
        const person = authorized.entity as Person
        const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
        if (person.userId) await peopleErrors.throw('account_exists')
        if (!person.birthDate) return peopleErrors.throw('account_birth_date_required')
        const settings = await clubSettings(ctx.container, scope, em)
        const today = calendarDateInZone(new Date(), settings.timezone)
        const threshold = settings.ownAccountMinAge
        if (accountAgePolicy({ birthDate: person.birthDate, threshold, today }) === 'below_threshold') {
          await peopleErrors.throw('account_age_below_threshold', { threshold })
        }
        const desired = await desiredRolesForPerson(em, person, scope, today, ctx.container)
        return {
          personId: person.id,
          ...scope,
          email: authorized.parsed.email,
          name: `${person.firstName} ${person.lastName}`,
          roles: desired([]),
          actingRole: authorized.actingRole,
        }
      },
    )

    // 2. The platform account and invitation (its own transaction; the e-mail is sent after the user exists).
    const account = await createAccount({ email: prepared.email, roles: prepared.roles, name: prepared.name }, ctx)

    // 3. Link the account to the person; a concurrent create that linked first leaves this user orphaned.
    const linked = await inWriteTransaction(ctx, 'people.persons.create_account.link', async (em) => {
      const person = await findOneWithDecryption(
        em,
        Person,
        {
          id: prepared.personId,
          tenantId: prepared.tenantId,
          organizationId: prepared.organizationId,
          deletedAt: null,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
        { tenantId: prepared.tenantId, organizationId: prepared.organizationId },
      )
      if (!person || person.userId) return null
      person.userId = account.userId
      if (!person.email) person.email = prepared.email
      person.updatedAt = new Date()
      return person
    })
    if (!linked) {
      const error = new Error('[internal] the person was linked to another account while this one was created')
      logger.warn('Created an account that could not be linked to its person', {
        personId: prepared.personId,
        userId: account.userId,
      })
      getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.account.orphan_user' })
      return peopleErrors.throw('account_exists')
    }

    await emitCrudSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'updated',
      entity: linked,
      identifiers: { id: linked.id, tenantId: linked.tenantId, organizationId: linked.organizationId },
      events: personEvents,
      indexer: personIndexer,
    })
    await emitPeopleEvent(
      'people.person.account_created',
      { id: linked.id, tenantId: linked.tenantId, organizationId: linked.organizationId, userId: account.userId },
      { persistent: true, tenantId: linked.tenantId, organizationId: linked.organizationId },
    )
    return {
      personId: linked.id,
      tenantId: linked.tenantId,
      organizationId: linked.organizationId,
      userId: account.userId,
      ...(account.warning ? { warning: account.warning } : {}),
      actingRole: prepared.actingRole,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.create_account', 'Create an account for a person'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.personId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      relatedResourceKind: 'auth.user',
      relatedResourceId: result.userId,
      context: { actingRole: result.actingRole, inviteEmailFailed: result.warning === 'invite_email_failed' },
    }
  },
}

registerCommand(createAccountCommand)

// People life-cycle spec phase L1 (REQ-L01, REQ-L02, DD-L01; #303): the re-send, the login e-mail and block, and the
// closing of an account. Each is gated by `people.accounts.manage` on its route and by the `club_admin` grant here,
// and reaches the platform only through the foundation's account helpers.

type AccountTarget = {
  personId: string
  tenantId: string
  organizationId: string
  userId: string
  account: AccountView
  actingRole: ActingRole
}

/** The person under its row lock, in the caller's scope with the `club_admin` grant, and its account (404 without). */
async function authorizeAccountTarget(
  rawInput: Record<string, unknown>,
  ctx: CommandRuntimeContext,
  em: EntityManager,
  options: { schema: typeof personAccountSchema | typeof updateAccountSchema; lock: 'updated_at' | 'none' },
) {
  const authorized = await authorizeScoped(
    {
      input: options.schema,
      resourceKind: RESOURCE_KIND,
      allowedKinds: ['club_admin'],
      loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
      resolveTarget: (_parsed, entity) => personTarget(entity as Person),
      lock: options.lock,
    },
    rawInput,
    ctx,
    em,
  )
  const person = authorized.entity as Person
  const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
  const account = await accountView(ctx.container, scope, person.userId, em)
  if (!person.userId || account.state === 'none') return peopleErrors.throw('account_not_found')
  const target: AccountTarget = {
    personId: person.id,
    ...scope,
    userId: person.userId,
    account,
    actingRole: authorized.actingRole,
  }
  return { target, person, parsed: authorized.parsed }
}

/** Today in the club's time zone, read on the caller's transaction (#836). */
async function clubToday(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
) {
  const settings = await clubSettings(
    ctx.container,
    { tenantId: scope.tenantId, organizationId: scope.organizationId },
    em,
  )
  return calendarDateInZone(new Date(), settings.timezone)
}

/** The locale of the invitation sent again (AC-F11, #584): the person's, else the club default, else `en`. */
async function invitationLocale(
  ctx: CommandRuntimeContext,
  scope: { tenantId: string; organizationId: string },
  person: Person,
) {
  const settings = await clubSettings(ctx.container, { tenantId: scope.tenantId, organizationId: scope.organizationId })
  return localeForPerson(person, settings.defaultLocale)
}

export type ResendInvitationCommandResult = {
  personId: string
  tenantId: string
  organizationId: string
  userId: string
  sentAt: string
  warning?: 'invite_email_failed'
  actingRole: ActingRole
}

/**
 * `people.persons.resend_invitation`: only while the account is `invited` (409 `invitation_not_pending` otherwise).
 * Not undoable: the e-mail is sent. The per-account and per-administrator limits are applied by the route.
 */
const resendInvitationCommand: CommandHandler<Record<string, unknown>, ResendInvitationCommandResult> = {
  id: 'people.persons.resend_invitation',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { target, person } = await inWriteTransaction(ctx, 'people.persons.resend_invitation.check', async (em) => {
      const authorized = await authorizeAccountTarget(rawInput, ctx, em, { schema: personAccountSchema, lock: 'none' })
      if (authorized.target.account.state !== 'invited') return peopleErrors.throw('invitation_not_pending')
      return authorized
    })
    const sent = await resendInvitation(ctx, target, target.userId, await invitationLocale(ctx, target, person))
    return {
      personId: target.personId,
      tenantId: target.tenantId,
      organizationId: target.organizationId,
      userId: target.userId,
      sentAt: sent.sentAt,
      ...(sent.warning ? { warning: sent.warning } : {}),
      actingRole: target.actingRole,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.resend_invitation', 'Send the invitation again'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.personId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      relatedResourceKind: 'auth.user',
      relatedResourceId: result.userId,
      context: { actingRole: result.actingRole, inviteEmailFailed: result.warning === 'invite_email_failed' },
    }
  },
}

export type UpdateAccountCommandResult = {
  personId: string
  tenantId: string
  organizationId: string
  userId: string
  account: AccountView
  updatedAt: string
  emailChanged: boolean
  blocked?: boolean
  warning?: 'invite_email_failed'
  actingRole: ActingRole
}

/**
 * `people.persons.update_account`: a new login e-mail (409 `email_taken`; the contact e-mail follows only when it
 * equalled the old login; an invited account gets the invitation again at the new address) and/or the block flag (the
 * club's last active administrator cannot be blocked, 422 `last_club_admin`). The person's version is checked (409)
 * and advanced. Not undoable through this command: the reverse change is another update.
 */
const updateAccountCommand: CommandHandler<Record<string, unknown>, UpdateAccountCommandResult> = {
  id: 'people.persons.update_account',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const prepared = await inWriteTransaction(ctx, 'people.persons.update_account.check', async (em) => {
      const { target, person, parsed } = await authorizeAccountTarget(rawInput, ctx, em, {
        schema: updateAccountSchema,
        lock: 'updated_at',
      })
      const input = parsed as { email?: string; blocked?: boolean }
      if (input.blocked === true && target.account.state !== 'blocked') {
        await assertNotLastClubAdmin(em, ctx.container, target, target.personId, await clubToday(ctx, em, target))
      }
      const oldLogin = target.account.email?.trim().toLowerCase() ?? null
      const newLogin = input.email?.trim()
      const emailChanged = newLogin !== undefined && newLogin.toLowerCase() !== oldLogin
      const contactFollows = emailChanged && (person.email?.trim().toLowerCase() ?? null) === oldLogin
      return {
        target,
        email: emailChanged ? newLogin : undefined,
        blocked: input.blocked,
        contactFollows,
      }
    })
    const { target } = prepared

    await updateAccount(ctx, target.userId, { email: prepared.email, blocked: prepared.blocked })

    const updated = await inWriteTransaction(ctx, 'people.persons.update_account.person', async (em) => {
      const person = await findOneWithDecryption(
        em,
        Person,
        { id: target.personId, tenantId: target.tenantId, organizationId: target.organizationId, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
        { tenantId: target.tenantId, organizationId: target.organizationId },
      )
      if (!person) return peopleErrors.throw('account_not_found')
      if (prepared.contactFollows && prepared.email) person.email = prepared.email
      person.updatedAt = new Date()
      return person
    })

    // An invited account follows its new address at once (J-L01 step 3); a failed e-mail is a warning only.
    const resent =
      prepared.email && target.account.state === 'invited' && prepared.blocked !== true
        ? await resendInvitation(ctx, target, target.userId, await invitationLocale(ctx, target, updated))
        : null
    const account = await accountView(ctx.container, target, target.userId)

    await emitCrudSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'updated',
      entity: updated,
      identifiers: { id: updated.id, tenantId: updated.tenantId, organizationId: updated.organizationId },
      events: personEvents,
      indexer: personIndexer,
    })
    await emitPeopleEvent(
      'people.person.account_updated',
      { id: updated.id, tenantId: updated.tenantId, organizationId: updated.organizationId, userId: target.userId },
      { persistent: true, tenantId: updated.tenantId, organizationId: updated.organizationId },
    )
    return {
      personId: target.personId,
      tenantId: target.tenantId,
      organizationId: target.organizationId,
      userId: target.userId,
      account,
      updatedAt: updated.updatedAt.toISOString(),
      emailChanged: prepared.email !== undefined,
      ...(prepared.blocked !== undefined ? { blocked: prepared.blocked } : {}),
      ...(resent?.warning ? { warning: resent.warning } : {}),
      actingRole: target.actingRole,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.update_account', "Change a person's account"),
      resourceKind: RESOURCE_KIND,
      resourceId: result.personId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      relatedResourceKind: 'auth.user',
      relatedResourceId: result.userId,
      context: {
        actingRole: result.actingRole,
        emailChanged: result.emailChanged,
        ...(result.blocked !== undefined ? { blocked: result.blocked } : {}),
        inviteEmailFailed: result.warning === 'invite_email_failed',
      },
    }
  },
}

export type CloseAccountCommandResult = {
  personId: string
  tenantId: string
  organizationId: string
  userId: string
  actingRole: ActingRole
}

/**
 * `people.persons.close_account`: deletes the platform user (`auth.users.delete`) and clears `user_id`. Refused for
 * the club's last active administrator (422 `last_club_admin`) and while an active role, guardianship or membership
 * remains (409 `account_has_purpose`). Not undoable: the platform user, its sessions and links are gone.
 */
const closeAccountCommand: CommandHandler<Record<string, unknown>, CloseAccountCommandResult> = {
  id: 'people.persons.close_account',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const target = await inWriteTransaction(ctx, 'people.persons.close_account.check', async (em) => {
      const { target } = await authorizeAccountTarget(rawInput, ctx, em, { schema: personAccountSchema, lock: 'none' })
      const today = await clubToday(ctx, em, target)
      await assertNotLastClubAdmin(em, ctx.container, target, target.personId, today)
      await assertAccountWithoutPurpose(em, ctx.container, target, target.personId, today)
      return target
    })

    await closeAccount(ctx, target.userId)

    const unlinked = await inWriteTransaction(ctx, 'people.persons.close_account.unlink', async (em) => {
      const person = await findOneWithDecryption(
        em,
        Person,
        { id: target.personId, tenantId: target.tenantId, organizationId: target.organizationId, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
        { tenantId: target.tenantId, organizationId: target.organizationId },
      )
      if (!person) return null
      if (person.userId === target.userId) person.userId = null
      person.updatedAt = new Date()
      return person
    })
    if (unlinked) {
      await emitCrudSideEffects({
        dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
        action: 'updated',
        entity: unlinked,
        identifiers: { id: unlinked.id, tenantId: unlinked.tenantId, organizationId: unlinked.organizationId },
        events: personEvents,
        indexer: personIndexer,
      })
    }
    await emitPeopleEvent(
      'people.person.account_closed',
      { id: target.personId, tenantId: target.tenantId, organizationId: target.organizationId, userId: target.userId },
      { persistent: true, tenantId: target.tenantId, organizationId: target.organizationId },
    )
    return {
      personId: target.personId,
      tenantId: target.tenantId,
      organizationId: target.organizationId,
      userId: target.userId,
      actingRole: target.actingRole,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.close_account', "Close a person's account"),
      resourceKind: RESOURCE_KIND,
      resourceId: result.personId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      relatedResourceKind: 'auth.user',
      relatedResourceId: result.userId,
      context: { actingRole: result.actingRole },
    }
  },
}

registerCommand(resendInvitationCommand)
registerCommand(updateAccountCommand)
registerCommand(closeAccountCommand)
