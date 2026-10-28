// `people.persons.create_account` (foundation spec P-07, J-F01 step 2; club spec *Account*; TEST-F04). The club
// administrator creates the account of a person: the age policy with the club's `own_account_min_age`, then the
// platform account and invitation through the foundation's `createAccount` with the person's desired roles, then
// `people_persons.user_id`, then `people.person.account_created`.
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { LockMode } from '@mikro-orm/core'
import { accountAgePolicy, type ActingRole } from '@vereino/core'
import { authorizeScoped, createAccount } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person } from '../data/entities'
import { createAccountSchema } from '../data/validators'
import { emitPeopleEvent } from '../events'
import { calendarDateInZone } from '../lib/people-rules'
import { clubSettings } from '../services/club-clock'
import { desiredRolesForPerson } from '../services/role-sync'
import { inWriteTransaction, loadPersonLocked, personEvents, personIndexer, personTarget } from './shared'

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
            allowedKinds: ['club_admin'],
            loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
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
        const settings = await clubSettings(ctx.container, scope)
        const today = calendarDateInZone(new Date(), settings.timezone)
        const threshold = settings.ownAccountMinAge
        if (accountAgePolicy({ birthDate: person.birthDate, threshold, today }) === 'below_threshold') {
          await peopleErrors.throw('account_age_below_threshold', { threshold })
        }
        const desired = await desiredRolesForPerson(em, person, scope, today)
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
