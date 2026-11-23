// A club leaving the shared instance (many clubs spec phase 4, REQ-M06, J-M03; #632): the job commands behind the
// operator commands `club_core offboard-club`, `export-club`, `delete-club` and `restore-club`. Each runs with a
// `system_job` grant for the club the operator named (`jobCommandContext`, BR-M1), so only the operator's shell reaches
// them, and each leaves one audit entry in the club's tenant: the notice, the export (file name, checksum, row counts),
// the deletion (row counts per table; written after the rows are gone, it is the club's one entry that stays) and the
// restore. No entry holds personal data. None is undoable.
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import path from 'node:path'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { clubCoreErrors } from '../api/errors'
import { ClubSettings } from '../data/entities'
import {
  OFFBOARDING_NOTICE_DAYS_DEFAULT,
  OFFBOARDING_NOTICE_DAYS_MAX,
  countsByModule,
  offboardingDates,
  offboardingState,
} from '../lib/club-offboarding'
import {
  deleteClub,
  exportClub,
  readClubArchive,
  restoreClub,
  type ClubDeletionSummary,
  type ClubExportSummary,
  type ClubRestoreRefusal,
  type ClubRestoreSummary,
} from '../services/club-offboarding'
import { CLUB_SETTINGS_RESOURCE_KIND } from './settings'
import { inWriteTransaction } from './shared'

const settingsIdSchema = z.object({ settingsId: z.uuid() })

/** Authorizes the operator's job context for the club and returns its scope. */
async function authorizeClubJob<TSchema extends z.ZodType>(
  schema: TSchema,
  rawInput: unknown,
  ctx: CommandRuntimeContext,
  em: EntityManager,
) {
  return authorizeScoped(
    {
      input: schema,
      resourceKind: CLUB_SETTINGS_RESOURCE_KIND,
      allowedKinds: ['system_job'],
      resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope }),
      lock: 'none',
      scopeSource: { job: true },
    },
    rawInput as Record<string, unknown>,
    ctx,
    em,
  )
}

type ClubLogBase = { settingsId: string; tenantId: string; organizationId: string; actingRole: ActingRole }

function logScope(result: ClubLogBase) {
  return {
    resourceKind: CLUB_SETTINGS_RESOURCE_KIND,
    resourceId: result.settingsId,
    tenantId: result.tenantId,
    organizationId: result.organizationId,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// club_core.clubs.offboard

const offboardSchema = settingsIdSchema
  .extend({
    noticeDays: z.number().int().min(OFFBOARDING_NOTICE_DAYS_DEFAULT).max(OFFBOARDING_NOTICE_DAYS_MAX),
    cancel: z.boolean(),
  })
  .strict()

export type OffboardClubResult = ClubLogBase & {
  noticeAt: string | null
  deleteAfter: string | null
  /** False when the club already had exactly this state (a notice already given is kept, not moved). */
  changed: boolean
}

/**
 * Records the club's notice to leave (`noticeDays` from now) or, with `cancel`, withdraws it. A notice already given is
 * kept as it is: the deletion date never moves by re-running the command.
 */
const offboardClubCommand: CommandHandler<Record<string, unknown>, OffboardClubResult> = {
  id: 'club_core.clubs.offboard',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'club_core.clubs.offboard', async (em) => {
      const authorized = await authorizeClubJob(offboardSchema, rawInput, ctx, em)
      const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const input = authorized.parsed
      const row = await em.findOne(
        ClubSettings,
        { id: input.settingsId, ...scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )
      if (!row) return clubCoreErrors.throw('club_not_found')
      let changed = false
      if (input.cancel && row.offboardingDeleteAfter) {
        row.offboardingNoticeAt = null
        row.offboardingDeleteAfter = null
        changed = true
      } else if (!input.cancel && !row.offboardingDeleteAfter) {
        const dates = offboardingDates(new Date(), input.noticeDays)
        row.offboardingNoticeAt = dates.noticeAt
        row.offboardingDeleteAfter = dates.deleteAfter
        changed = true
      }
      if (changed) {
        row.updatedAt = new Date()
        await em.flush()
      }
      return {
        settingsId: row.id,
        ...scope,
        noticeAt: row.offboardingNoticeAt?.toISOString() ?? null,
        deleteAfter: row.offboardingDeleteAfter?.toISOString() ?? null,
        changed,
        actingRole: authorized.actingRole,
      }
    })
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('club_core.audit.clubs.offboard', 'Record the club leaving'),
      ...logScope(result),
      context: {
        actingRole: result.actingRole,
        noticeAt: result.noticeAt,
        deleteAfter: result.deleteAfter,
        changed: result.changed,
      },
    }
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// club_core.clubs.export

const exportSchema = settingsIdSchema.extend({ slug: z.string().min(1), out: z.string().min(1) }).strict()

export type ExportClubResult = ClubLogBase & { summary: ClubExportSummary }

/** Writes the club's archive (`exportClub`); a read, logged with the file name, checksum and row counts. */
const exportClubCommand: CommandHandler<Record<string, unknown>, ExportClubResult> = {
  id: 'club_core.clubs.export',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const authorized = await inWriteTransaction(ctx, 'club_core.clubs.export', (em) =>
      authorizeClubJob(exportSchema, rawInput, ctx, em),
    )
    const input = authorized.parsed
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const summary = await exportClub(
      ctx.container,
      { ...scope, slug: input.slug, settingsId: input.settingsId },
      input.out,
      new Date(),
    )
    return { settingsId: input.settingsId, ...scope, summary, actingRole: authorized.actingRole }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('club_core.audit.clubs.export', 'Export the club data'),
      ...logScope(result),
      context: {
        actingRole: result.actingRole,
        file: path.basename(result.summary.path),
        sha256: result.summary.sha256,
        bytes: result.summary.bytes,
        files: result.summary.files,
        missingFiles: result.summary.missingFiles.length,
        rows: countsByModule(result.summary.tables),
      },
    }
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// club_core.clubs.delete

const deleteSchema = settingsIdSchema.extend({ slug: z.string().min(1) }).strict()

export type DeleteClubResult = ClubLogBase & { deletedAt: string; summary: ClubDeletionSummary }

/**
 * Deletes the club (`deleteClub`) once its notice period has ended — checked again here, under the settings row's
 * lock, so no caller deletes a club early (`offboarding_not_due`). Logged after the rows are gone: the entry names the
 * tables and row counts, and is the club's one audit entry that stays.
 */
const deleteClubCommand: CommandHandler<Record<string, unknown>, DeleteClubResult> = {
  id: 'club_core.clubs.delete',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const authorized = await inWriteTransaction(ctx, 'club_core.clubs.delete', async (em) => {
      const granted = await authorizeClubJob(deleteSchema, rawInput, ctx, em)
      const parsed = granted.parsed
      const row = await em.findOne(ClubSettings, {
        id: parsed.settingsId,
        tenantId: granted.tenantId,
        organizationId: granted.organizationId,
        deletedAt: null,
      })
      if (!row) return clubCoreErrors.throw('club_not_found')
      if (offboardingState(row.offboardingDeleteAfter, new Date()).state !== 'due') {
        return clubCoreErrors.throw('offboarding_not_due')
      }
      return granted
    })
    const input = authorized.parsed
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const summary = await deleteClub(
      ctx.container,
      { ...scope, slug: input.slug, settingsId: input.settingsId },
      { dryRun: false },
    )
    return {
      settingsId: input.settingsId,
      ...scope,
      deletedAt: new Date().toISOString(),
      summary,
      actingRole: authorized.actingRole,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('club_core.audit.clubs.delete', 'Delete the club'),
      ...logScope(result),
      context: {
        actingRole: result.actingRole,
        deletedAt: result.deletedAt,
        tables: Object.fromEntries(result.summary.tables.map((entry) => [entry.table, entry.rows])),
        schedulesUnregistered: result.summary.schedulesUnregistered,
        filesDeleted: result.summary.filesDeleted,
        filesFailed: result.summary.filesFailed,
        encryptionKey: 'derived',
      },
    }
  },
}

// ---------------------------------------------------------------------------------------------------------------------
// club_core.clubs.restore

const restoreSchema = z.object({ archive: z.string().min(1) }).strict()

export type RestoreClubResult = {
  tenantId: string
  organizationId: string
  actingRole: ActingRole
  archive: string
  outcome: ClubRestoreSummary | ClubRestoreRefusal
}

/**
 * Restores the club of an archive (`readClubArchive`, then `restoreClub`). The caller builds the job context for the
 * archive's club; an archive of another club is refused. A refusal writes nothing and is not logged.
 */
const restoreClubCommand: CommandHandler<Record<string, unknown>, RestoreClubResult> = {
  id: 'club_core.clubs.restore',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const authorized = await inWriteTransaction(ctx, 'club_core.clubs.restore', (em) =>
      authorizeClubJob(restoreSchema, rawInput, ctx, em),
    )
    const input = authorized.parsed
    const base = {
      tenantId: authorized.tenantId,
      organizationId: authorized.organizationId,
      actingRole: authorized.actingRole,
      archive: path.basename(input.archive),
    }
    const plan = await readClubArchive(input.archive)
    if ('status' in plan) return { ...base, outcome: plan }
    if (plan.manifest.club.tenantId !== authorized.tenantId) {
      throw new Error('[internal] club_core.clubs.restore: the archive belongs to another club than the job context')
    }
    return { ...base, outcome: await restoreClub(ctx.container, plan, { dryRun: false }) }
  },
  async buildLog({ result }) {
    if ('status' in result.outcome) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('club_core.audit.clubs.restore', 'Restore the club data'),
      resourceKind: CLUB_SETTINGS_RESOURCE_KIND,
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: {
        actingRole: result.actingRole,
        archive: result.archive,
        files: result.outcome.files,
        rows: countsByModule(result.outcome.tables),
      },
    }
  },
}

registerCommand(offboardClubCommand)
registerCommand(exportClubCommand)
registerCommand(deleteClubCommand)
registerCommand(restoreClubCommand)
