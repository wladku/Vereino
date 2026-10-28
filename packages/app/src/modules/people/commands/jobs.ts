// Commands without a session (foundation spec P-02 `{ job: true }` scope source, P-12): the role-expiry job and the
// first-administrator bootstrap. Both accept only the `system_job` grant of the organization their context names
// (`jobCommandContext`), so no HTTP route can reach them; the worker and the module CLI dispatch them.
import { randomUUID } from 'node:crypto'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { isActiveAt, type ActingRole } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { Person, RoleAssignment } from '../data/entities'
import { bootstrapAdminSchema, syncRolesJobSchema } from '../data/validators'
import { clubToday } from '../services/club-clock'
import {
  syncAllPersonRoles,
  syncPersonRolesInTransaction,
  type PersonRoleSyncOutcome,
  type RoleSyncCounts,
} from '../services/role-sync'
import { inWriteTransaction } from './shared'

const logger = createLogger('people').child({ component: 'jobs' })

type OrganizationTarget = { tenantId: string; organizationId: string; actingRole: ActingRole }

/** Authorizes a job command for its organization: only the `system_job` grant of the registration's scope. */
function authorizeJob(
  ctx: CommandRuntimeContext,
  label: string,
  input: Parameters<typeof authorizeScoped>[0]['input'],
  rawInput: unknown,
) {
  return inWriteTransaction(ctx, label, async (em) => {
    const authorized = await authorizeScoped(
      {
        input,
        resourceKind: 'people.organization',
        allowedKinds: ['system_job'],
        resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope }),
        lock: 'none',
        scopeSource: { job: true },
      },
      rawInput,
      ctx,
      em,
    )
    const target: OrganizationTarget = {
      tenantId: authorized.tenantId,
      organizationId: authorized.organizationId,
      actingRole: authorized.actingRole,
    }
    return { target, parsed: authorized.parsed as Record<string, unknown> }
  })
}

export type SyncRolesJobResult = OrganizationTarget & { today: string; counts: RoleSyncCounts }

/**
 * `people.persons.sync_roles` — the `people:sync-role-expiry` job: recomputes the desired roles of every person
 * with an account on `today` (assignments that start or end, 18th birthdays). Idempotent; not undoable because it
 * only re-derives state from the assignments, which are themselves audited.
 */
const syncRolesJobCommand: CommandHandler<Record<string, unknown>, SyncRolesJobResult> = {
  id: 'people.persons.sync_roles',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { target, parsed } = await authorizeJob(
      ctx,
      'people.persons.sync_roles.authorize',
      syncRolesJobSchema,
      rawInput,
    )
    const scope = { tenantId: target.tenantId, organizationId: target.organizationId }
    const today = typeof parsed.today === 'string' ? parsed.today : await clubToday(ctx.container, scope)
    logger.info('Role sync started', { ...scope, today })
    const counts = await syncAllPersonRoles(ctx.container, scope, {
      today,
      commandContext: ctx,
      onFailure: (error) => {
        logger.warn('Role sync failed for one person; the next run retries it', { ...scope, err: error })
        getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.role_sync.failed' })
      },
    })
    logger.info('Role sync finished', { ...scope, today, ...counts })
    return { ...target, today, counts }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.jobs.sync_roles', 'Synchronize staff roles'),
      resourceKind: 'people.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: { actingRole: result.actingRole, today: result.today, ...result.counts },
    }
  },
}

export type BootstrapAdminResult = OrganizationTarget & {
  personId: string
  userId: string
  created: boolean
  roleSync: PersonRoleSyncOutcome
}

/**
 * `people.persons.bootstrap_admin` — the club's first administrator (CLI `people bootstrap-admin`): links an
 * existing user of the organization to a person with an active `club_admin` assignment and syncs the user's roles.
 * Idempotent: a user already linked keeps the person and gets an assignment only when none is active. Not undoable
 * (an operator action outside the UI).
 */
const bootstrapAdminCommand: CommandHandler<Record<string, unknown>, BootstrapAdminResult> = {
  id: 'people.persons.bootstrap_admin',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { target, parsed } = await authorizeJob(
      ctx,
      'people.persons.bootstrap_admin.authorize',
      bootstrapAdminSchema,
      rawInput,
    )
    const input = bootstrapAdminSchema.parse(parsed)
    const scope = { tenantId: target.tenantId, organizationId: target.organizationId }
    const today = await clubToday(ctx.container, scope)
    const validFrom = input.validFrom ?? today
    return inWriteTransaction(ctx, 'people.persons.bootstrap_admin', async (em) => {
      let person = await em.findOne(Person, { ...scope, userId: input.userId, deletedAt: null })
      const created = !person
      if (!person) {
        person = em.create(Person, {
          id: randomUUID(),
          ...scope,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          userId: input.userId,
        })
        em.persist(person)
        await em.flush()
      }
      const assignments = await em.find(RoleAssignment, {
        ...scope,
        personId: person.id,
        role: 'club_admin',
        deletedAt: null,
      })
      const hasActive = assignments.some((row) =>
        isActiveAt({ validFrom: row.validFrom, validTo: row.validTo ?? null }, today),
      )
      if (!hasActive) {
        em.persist(
          em.create(RoleAssignment, {
            id: randomUUID(),
            ...scope,
            personId: person.id,
            role: 'club_admin',
            validFrom,
            validTo: null,
          }),
        )
        await em.flush()
      }
      const roleSync = await syncPersonRolesInTransaction(em, person, { scope, today, commandContext: ctx })
      return { ...target, personId: person.id, userId: input.userId, created, roleSync }
    })
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.jobs.bootstrap_admin', 'Set up the club administrator'),
      resourceKind: 'people.person',
      resourceId: result.personId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      relatedResourceKind: 'auth.user',
      relatedResourceId: result.userId,
      context: { actingRole: result.actingRole, created: result.created, roleSync: result.roleSync },
    }
  },
}

registerCommand(syncRolesJobCommand)
registerCommand(bootstrapAdminCommand)
