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
import { authorizeScoped } from '@/modules/foundation'
import { Person, PersonImport, PersonImportRow, RoleAssignment } from '../data/entities'
import { bootstrapAdminSchema, importPurgeJobSchema, syncRolesJobSchema } from '../data/validators'
import { importPurgeCutoff } from '../lib/import-rules'
import { IMPORT_FILE_OWNER_ENTITY, IMPORT_PARTITION, attachmentServiceOf } from './imports'
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

export type PurgeImportsCounts = { imports: number; rows: number; files: number; failed: number }

export type PurgeImportsJobResult = OrganizationTarget & { now: string; counts: PurgeImportsCounts }

type ImportScope = { tenantId: string; organizationId: string }

/**
 * Purges one import in its own transaction: deletes its staged rows (a row whose group waits for the `groups`
 * membership hook keeps only its ids and group label), releases its file from `attachments` and sets `purged_at`.
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
    const rows = await em.nativeDelete(PersonImportRow, { importId, ...scope, membershipStatus: null })
    await em.nativeUpdate(PersonImportRow, { importId, ...scope, membershipStatus: { $ne: null } }, { raw: null })
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
 * `people.imports.purge` — the daily `people:purge-import-rows` job (club spec *Events, Jobs* row, REQ-036): the staged
 * rows and the file of every import committed or cancelled 30 days ago (and of a preview left open as long) are
 * deleted. Idempotent (`purged_at`); one failing import is logged and retried by the next run. Not undoable.
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

registerCommand(syncRolesJobCommand)
registerCommand(bootstrapAdminCommand)
registerCommand(purgeImportsJobCommand)
