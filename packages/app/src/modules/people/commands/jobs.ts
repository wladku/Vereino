// Commands without a session (foundation spec P-02 `{ job: true }` scope source, P-12): the role-expiry job and the
// first-administrator bootstrap. Both accept only the `system_job` grant of the organization their context names
// (`jobCommandContext`), so no HTTP route can reach them; the worker and the module CLI dispatch them.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { isActiveAt, type ActingRole } from '@vereino/core'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { authorizeScoped, foundationErrors, trustedScopeOf } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person, PersonImport, PersonImportRow, RoleAssignment } from '../data/entities'
import {
  bootstrapAdminSchema,
  importPurgeJobSchema,
  lifeCycleJobSchema,
  retentionSweepJobSchema,
  syncRolesJobSchema,
} from '../data/validators'
import { LIFE_CYCLE_STEPS } from '../lib/life-cycle-rules'
import { runLifeCycle, type LifeCycleCounts } from '../services/life-cycle'
import { runRetentionSweep, type RetentionSweepRun } from '../services/retention-sweep'
import { MEMBERSHIP_WAITING_STATUSES, importPurgeCutoff } from '../lib/import-rules'
import { IMPORT_FILE_OWNER_ENTITY, IMPORT_PARTITION, attachmentServiceOf } from './imports'
import { clubToday } from '../services/club-clock'
import { closeDepartedAccounts, type DepartedAccountCounts } from '../services/departure-accounts'
import { activeClubAdministrator, isOrganizationUser } from '../services/first-administrator'
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

export type SyncRolesJobResult = OrganizationTarget & {
  today: string
  counts: RoleSyncCounts
  /** People life-cycle spec Q-L09 (#306): accounts of persons who left before `today`, closed by this run. */
  accounts: DepartedAccountCounts
}

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
    const accounts = await closeDepartedAccounts(ctx, scope, today, (error) => {
      logger.warn('Closing the account of a departed person failed; the next run retries it', { ...scope, err: error })
      getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.departure.account_close_failed' })
    })
    if (accounts.closed + accounts.failed > 0) logger.info('Departed accounts closed', { ...scope, today, ...accounts })
    return { ...target, today, counts, accounts }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.jobs.sync_roles', 'Synchronize staff roles'),
      resourceKind: 'people.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: {
        actingRole: result.actingRole,
        today: result.today,
        ...result.counts,
        accountsClosed: result.accounts.closed,
        accountsFailed: result.accounts.failed,
      },
    }
  },
}

export type BootstrapAdminResult = OrganizationTarget & {
  personId: string
  userId: string
  created: boolean
  roleSync: PersonRoleSyncOutcome
}

/** The platform feature that lets a technical administrator create the club's first administrator (V-L04). */
export const FIRST_ADMINISTRATOR_FEATURE = 'auth.users.create'

/**
 * Authorizes `people.persons.bootstrap_admin`: a job context (the CLI) by its `system_job` grant, or a session (the
 * panel page `/backend/people/first-administrator`, REQ-L13) by the platform feature `auth.users.create` in the
 * session's tenant and organization — the technical administrator holds no club grant yet. A session caller acts
 * only while the club has no administrator and only for a user of the organization.
 */
async function authorizeBootstrap(
  ctx: CommandRuntimeContext,
  rawInput: unknown,
): Promise<{ target: OrganizationTarget; parsed: Record<string, unknown>; session: boolean }> {
  if (!ctx.auth) {
    const job = await authorizeJob(ctx, 'people.persons.bootstrap_admin.authorize', bootstrapAdminSchema, rawInput)
    return { ...job, session: false }
  }
  const scope = trustedScopeOf(ctx)
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  const allowed = scope !== null && (await rbac.userHasAllFeatures(ctx.auth.sub, [FIRST_ADMINISTRATOR_FEATURE], scope))
  if (!scope || !allowed) return foundationErrors.throw('scope_denied')
  return {
    target: { ...scope, actingRole: 'system' },
    parsed: bootstrapAdminSchema.parse(rawInput),
    session: true,
  }
}

/**
 * `people.persons.bootstrap_admin` — the club's first administrator (CLI `people bootstrap-admin`; the panel's
 * `POST /api/people/first-administrator`, REQ-L13): links an existing user of the organization to a person with an
 * active `club_admin` assignment and syncs the user's roles. From the CLI it is idempotent: a user already linked
 * keeps the person and gets an assignment only when none is active. From the panel it refuses with 409
 * `club_admin_exists` (naming the administrator) once the club has one, and with 404 `user_not_in_organization` for a
 * user outside the organization. Not undoable (it creates the club's first access).
 */
const bootstrapAdminCommand: CommandHandler<Record<string, unknown>, BootstrapAdminResult> = {
  id: 'people.persons.bootstrap_admin',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { target, parsed, session } = await authorizeBootstrap(ctx, rawInput)
    const input = bootstrapAdminSchema.parse(parsed)
    const scope = { tenantId: target.tenantId, organizationId: target.organizationId }
    const today = await clubToday(ctx.container, scope)
    const validFrom = input.validFrom ?? today
    return inWriteTransaction(ctx, 'people.persons.bootstrap_admin', async (em) => {
      if (session) {
        // Read inside the write transaction, so two concurrent first-administrator calls cannot both pass.
        const existing = await activeClubAdministrator(em, scope, today)
        if (existing) {
          return peopleErrors.throw('club_admin_exists', {
            administrator: existing.name,
            administratorPersonId: existing.personId,
          })
        }
        if (!(await isOrganizationUser(em, scope, input.userId))) return peopleErrors.throw('user_not_in_organization')
      }
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

export type PurgeImportsCounts = { imports: number; rows: number; files: number; failed: number }

export type PurgeImportsJobResult = OrganizationTarget & { now: string; counts: PurgeImportsCounts }

type ImportScope = { tenantId: string; organizationId: string }

/** A row whose membership still waits for the `groups` hook (`membership_status` holds the reason, #65). */
const WAITING_ROW = { membershipStatus: { $in: [...MEMBERSHIP_WAITING_STATUSES] } }

/**
 * Purges one import in its own transaction: deletes its staged rows (a row whose membership still waits for the
 * `groups` hook keeps only its ids and group label; a processed one goes like any other row), releases its file from
 * `attachments` and sets `purged_at`.
 * An import still open after the retention period is treated as abandoned and cancelled first. The file's bytes are
 * deleted after the transaction commits; a file already gone is fine. Returns null when another run purged it.
 */
async function purgeImport(
  ctx: CommandRuntimeContext,
  scope: ImportScope,
  importId: string,
  now: Date,
): Promise<{ rows: number; file: boolean } | null> {
  const outcome = await inWriteTransaction(ctx, 'people.imports.purge.one', async (em: EntityManager) => {
    const record = await em.findOne(
      PersonImport,
      { id: importId, ...scope, purgedAt: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!record) return null
    if (record.status === 'previewed') {
      record.status = 'cancelled'
      record.cancelledAt = now
    }
    const rows = await em.nativeDelete(PersonImportRow, {
      importId,
      ...scope,
      $or: [{ membershipStatus: null }, { membershipStatus: { $nin: [...MEMBERSHIP_WAITING_STATUSES] } }],
    })
    await em.nativeUpdate(PersonImportRow, { importId, ...scope, ...WAITING_ROW }, { raw: null })
    let cleanup: (() => Promise<void>) | null = null
    if (record.fileAttachmentId) {
      try {
        const released = await attachmentServiceOf(ctx).releaseScoped?.(
          {
            attachmentId: record.fileAttachmentId,
            ...scope,
            expectedOwner: { entityId: IMPORT_FILE_OWNER_ENTITY, recordId: record.id },
            expectedAssignment: { type: IMPORT_FILE_OWNER_ENTITY, id: record.id },
            expectedPartitionCode: IMPORT_PARTITION,
          },
          { em, flush: false },
        )
        cleanup = released ?? null
      } catch (error: unknown) {
        // Already gone: nothing left to delete.
        if (!isCrudHttpError(error) || error.status !== 404) throw error
      }
    }
    const file = record.fileAttachmentId !== null && record.fileAttachmentId !== undefined
    record.fileAttachmentId = null
    record.purgedAt = now
    record.updatedAt = now
    await em.flush()
    return { rows, file, cleanup }
  })
  if (!outcome) return null
  await outcome.cleanup?.()
  return { rows: outcome.rows, file: outcome.file }
}

/**
 * The rows of imports purged earlier that a re-run of the commit has processed since (#65): their 30 days are over, so
 * they go now; the rows still waiting stay. Returns how many were deleted.
 */
async function purgeProcessedRows(ctx: CommandRuntimeContext, scope: ImportScope): Promise<number> {
  return inWriteTransaction(ctx, 'people.imports.purge.processed', async (em: EntityManager) => {
    const purged = await em.find(
      PersonImport,
      { ...scope, purgedAt: { $ne: null } },
      { fields: ['id'], orderBy: { createdAt: 'asc' } },
    )
    if (purged.length === 0) return 0
    return em.nativeDelete(PersonImportRow, {
      ...scope,
      importId: { $in: purged.map((record) => record.id) },
      membershipStatus: { $nin: [...MEMBERSHIP_WAITING_STATUSES] },
    })
  })
}

/**
 * `people.imports.purge` — the daily `people:purge-import-rows` job (club spec *Events, Jobs* row, REQ-036): the staged
 * rows and the file of every import committed or cancelled 30 days ago (and of a preview left open as long) are
 * deleted, except the rows whose membership still waits for the `groups` hook; the rows of an import purged earlier
 * that a re-run has processed since are deleted too. Idempotent (`purged_at`); one failing import is logged and
 * retried by the next run. Not undoable.
 */
const purgeImportsJobCommand: CommandHandler<Record<string, unknown>, PurgeImportsJobResult> = {
  id: 'people.imports.purge',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { target, parsed } = await authorizeJob(ctx, 'people.imports.purge.authorize', importPurgeJobSchema, rawInput)
    const scope = { tenantId: target.tenantId, organizationId: target.organizationId }
    const now = typeof parsed.now === 'string' ? new Date(parsed.now) : new Date()
    const cutoff = importPurgeCutoff(now)
    const due = await ctx.container
      .resolve<EntityManager>('em')
      .fork()
      .find(
        PersonImport,
        {
          ...scope,
          deletedAt: null,
          purgedAt: null,
          $or: [
            { status: 'committed', committedAt: { $lte: cutoff } },
            { status: 'cancelled', cancelledAt: { $lte: cutoff } },
            { status: 'previewed', createdAt: { $lte: cutoff } },
          ],
        },
        { fields: ['id'], orderBy: { createdAt: 'asc' } },
      )
    const counts: PurgeImportsCounts = { imports: 0, rows: 0, files: 0, failed: 0 }
    logger.info('Import purge started', { ...scope, due: due.length })
    for (const { id } of due) {
      try {
        const purged = await purgeImport(ctx, scope, id, now)
        if (!purged) continue
        counts.imports += 1
        counts.rows += purged.rows
        if (purged.file) counts.files += 1
      } catch (error: unknown) {
        counts.failed += 1
        logger.warn('Import purge failed for one import; the next run retries it', { ...scope, err: error })
        getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.import_purge.failed' })
      }
    }
    try {
      counts.rows += await purgeProcessedRows(ctx, scope)
    } catch (error: unknown) {
      counts.failed += 1
      logger.warn('Purging processed rows of purged imports failed; the next run retries it', { ...scope, err: error })
      getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.import_purge.failed' })
    }
    logger.info('Import purge finished', { ...scope, ...counts })
    return { ...target, now: now.toISOString(), counts }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.jobs.purge_imports', 'Purge people imports'),
      resourceKind: 'people.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: { actingRole: result.actingRole, now: result.now, ...result.counts },
    }
  },
}

export type LifeCycleJobResult = OrganizationTarget & {
  today: string
  dryRun: boolean
  /** The steps this release runs (step 5, erasure step two, joins with phase L6). */
  steps: string[]
  counts: LifeCycleCounts
  /** Wards with an active guardianship and no birth date: skipped and listed for the administrator. */
  withoutBirthDate: string[]
  cameOfAgePersonIds: string[]
}

/**
 * `people.persons.life_cycle` — the daily `people:life-cycle` job (people life-cycle spec REQ-L06, REQ-L07, DD-L08,
 * DD-L09; #310): notices 30 days before an 18th birthday; on the birthday the guardianships end the day before, the
 * consents move to the adult and `people.person.came_of_age` is emitted; account-age notices; the accounts of dated
 * departures close (`services/life-cycle.ts`). Idempotent through the state it writes and the dispatch keys, so a
 * missed day is caught up by the next run; `dryRun` counts and changes nothing but its audit entry. Not undoable: a guardianship it ended
 * is re-created by the administrator (*Rollout*); the audit entry carries the counts.
 */
const lifeCycleJobCommand: CommandHandler<Record<string, unknown>, LifeCycleJobResult> = {
  id: 'people.persons.life_cycle',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { target, parsed } = await authorizeJob(
      ctx,
      'people.persons.life_cycle.authorize',
      lifeCycleJobSchema,
      rawInput,
    )
    const scope = { tenantId: target.tenantId, organizationId: target.organizationId }
    const today = typeof parsed.today === 'string' ? parsed.today : await clubToday(ctx.container, scope)
    const dryRun = parsed.dryRun === true
    logger.info('Life-cycle job started', { ...scope, today, dryRun })
    const run = await runLifeCycle(ctx, scope, {
      today,
      dryRun,
      onFailure: (error, step) => {
        logger.warn('A life-cycle step failed for one person; the next run retries it', { ...scope, step, err: error })
        getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.life_cycle.failed' })
      },
    })
    logger.info('Life-cycle job finished', {
      ...scope,
      today,
      dryRun,
      ...run.counts,
      withoutBirthDate: run.withoutBirthDate.length,
    })
    return { ...target, today, dryRun, steps: [...LIFE_CYCLE_STEPS], ...run }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.jobs.life_cycle', 'Run the people life cycle'),
      resourceKind: 'people.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: {
        actingRole: result.actingRole,
        today: result.today,
        dryRun: result.dryRun,
        steps: result.steps,
        ...result.counts,
        withoutBirthDate: result.withoutBirthDate.length,
        cameOfAgePersonIds: result.cameOfAgePersonIds,
      },
    }
  },
}

export type RetentionSweepJobResult = OrganizationTarget & RetentionSweepRun & { today: string; dryRun: boolean }

/**
 * `people.persons.retention_sweep` — the daily `people:retention-sweep` job (club spec REQ-041, amendment B; #471):
 * anonymises the former participants and guardians who left `former_participant_retention_months` ago or earlier and
 * have no role, guardianship, other module's record, open charge or cash held past the cutoff, each through
 * `people.persons.anonymize` with the reason `retention_sweep` (`services/retention-sweep.ts`). Idempotent: an
 * anonymised person is not a candidate again. `dryRun` counts and changes nothing but its own audit entry. Not
 * undoable (an anonymisation never is); the audit entry and the log carry counts only.
 */
const retentionSweepJobCommand: CommandHandler<Record<string, unknown>, RetentionSweepJobResult> = {
  id: 'people.persons.retention_sweep',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { target, parsed } = await authorizeJob(
      ctx,
      'people.persons.retention_sweep.authorize',
      retentionSweepJobSchema,
      rawInput,
    )
    const scope = { tenantId: target.tenantId, organizationId: target.organizationId }
    const today = typeof parsed.today === 'string' ? parsed.today : await clubToday(ctx.container, scope)
    const dryRun = parsed.dryRun === true
    const run = await runRetentionSweep(ctx, scope, {
      today,
      dryRun,
      onFailure: (error) => {
        logger.warn('Anonymising one former person failed; the next run retries it', { ...scope, err: error })
        getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.retention_sweep.failed' })
      },
    })
    logger.info('Retention sweep finished', {
      ...scope,
      today,
      dryRun,
      months: run.months,
      cutoff: run.cutoff,
      ...run.counts,
    })
    return { ...target, today, dryRun, ...run }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.jobs.retention_sweep', 'Anonymise former participants'),
      resourceKind: 'people.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: {
        actingRole: result.actingRole,
        today: result.today,
        dryRun: result.dryRun,
        months: result.months,
        cutoff: result.cutoff,
        ...result.counts,
      },
    }
  },
}

registerCommand(syncRolesJobCommand)
registerCommand(bootstrapAdminCommand)
registerCommand(purgeImportsJobCommand)
registerCommand(lifeCycleJobCommand)
registerCommand(retentionSweepJobCommand)
