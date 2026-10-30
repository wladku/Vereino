// `club_core.logos.set` and `club_core.logos.remove` (club spec glossary *Logo*, REQ-028, TEST-040; #29): the club logo
// (club administrator) and a section logo (the club administrator, or the coordinator of that section — 403
// `scope_denied` for another section). The bytes go to the platform `attachments` module through its public
// `attachmentService` (private partition, owner and assignment set, so a read names exactly this file); the pointer
// on the settings row or the section is written in the upload transaction (`persistLink`), after the scope and the lock
// token are checked again on the locked row. The route checks the format (PNG, JPEG, WebP — no SVG) and the size
// (2 MB) by the file's bytes before the command runs.
//
// `set` is not undoable: its bytes are not part of the stored command input, so a redo could not repeat it (the
// platform's documents module does the same); replacing or removing the logo is the compensating action. `remove` is
// undoable (the pointer comes back). Earlier logo files are kept in `attachments`, so an undo always finds its file.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { ActingRole } from '@vereino/core'
import type { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec } from '@/modules/foundation'
import { ClubSettings, type Section } from '../data/entities'
import { ensureClubSettingsRow } from '../data/queries'
import { logoTargetSchema, type LogoTarget } from '../data/validators'
import { clubSettingsEvents, CLUB_SETTINGS_RESOURCE_KIND } from './settings'
import { sectionEvents } from './sections'
import { sectionContentSpec } from './section-public'
import { emitStructure, inWriteTransaction, structureLog, type StructureCommandResult } from './shared'

/** The private partition every Vereino file of `club_core` is stored in. */
export const CLUB_CORE_PARTITION = 'privateAttachments'

/** Attachment owners and assignments of the logos (`readScoped` and `releaseScoped` match them exactly). */
export const CLUB_LOGO_OWNER_ENTITY = 'club_core:club_settings'
export const CLUB_LOGO_ASSIGNMENT = 'club_core:club_logo'
export const SECTION_LOGO_OWNER_ENTITY = 'club_core:section'
export const SECTION_LOGO_ASSIGNMENT = 'club_core:section_logo'

/** Where the route hands the checked upload to the command (never part of the stored command input). */
export const CLUB_CORE_UPLOAD_CONTEXT = Symbol.for('vereino.club_core.upload')

export type CheckedUpload = { buffer: Buffer; fileName: string; mimeType: string }

type UploadContext = CommandRuntimeContext & { [CLUB_CORE_UPLOAD_CONTEXT]?: CheckedUpload }

/** The command context carrying a checked upload. */
export function withUpload(ctx: CommandRuntimeContext, upload: CheckedUpload): CommandRuntimeContext {
  return Object.assign(ctx, { [CLUB_CORE_UPLOAD_CONTEXT]: upload })
}

export function uploadOf(ctx: CommandRuntimeContext): CheckedUpload {
  const upload = (ctx as UploadContext)[CLUB_CORE_UPLOAD_CONTEXT]
  if (!upload || !Buffer.isBuffer(upload.buffer)) throw new CrudHttpError(400, { error: 'File is required' })
  return upload
}

export function attachmentServiceOf(ctx: CommandRuntimeContext): AttachmentService {
  const container = ctx.container
  if (!container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  return container.resolve<AttachmentService>('attachmentService')
}

type LogoRow = ClubSettings | Section

export type LogoSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  target: LogoTarget['target']
  logoAttachmentId: string | null
}

export type LogoCommandResult = StructureCommandResult<LogoRow, LogoSnapshot> & { target: LogoTarget }

function logoSnapshot(row: LogoRow, target: LogoTarget): LogoSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    target: target.target,
    logoAttachmentId: row.logoAttachmentId ?? null,
  }
}

/** The club settings row, row-locked in the trusted scope: only the club administrator changes the club logo. */
function clubLogoSpec(ctx: CommandRuntimeContext): AuthorizeScopedSpec<typeof logoTargetSchema, ClubSettings> {
  const trusted = trustedScopeOf(ctx)
  return {
    input: logoTargetSchema,
    resourceKind: CLUB_SETTINGS_RESOURCE_KIND,
    allowedKinds: ['club_admin'],
    loadTarget: (_parsed, em, lock) =>
      trusted ? em.findOne(ClubSettings, { ...trusted, deletedAt: null }, lock) : Promise.resolve(null),
    resolveTarget: (_parsed, entity, scope) => ({
      id: entity?.id ?? scope.organizationId,
      tenantId: entity?.tenantId ?? scope.tenantId,
      organizationId: entity?.organizationId ?? scope.organizationId,
    }),
  }
}

/**
 * Parses the target, ensures the club's settings row for a club target, and authorizes on the locked row: the club
 * administrator for the club, the section's coordinator or the club administrator for a section.
 */
async function authorizeLogo(
  rawInput: unknown,
  ctx: CommandRuntimeContext,
  em: EntityManager,
  mode: 'execute' | 'replay' = 'execute',
): Promise<{ row: LogoRow; target: LogoTarget; actingRole: ActingRole }> {
  const target = logoTargetSchema.parse(rawInput)
  if (target.target === 'club') {
    const trusted = trustedScopeOf(ctx)
    if (trusted && mode === 'execute') await ensureClubSettingsRow(em, trusted)
    const authorized = await authorizeScoped(clubLogoSpec(ctx), target, ctx, em, { mode })
    if (!authorized.entity) throw new Error('[internal] club settings row missing after ensure')
    return { row: authorized.entity, target, actingRole: authorized.actingRole }
  }
  const authorized = await authorizeScoped(
    sectionContentSpec(logoTargetSchema, ctx, (parsed) => (parsed.target === 'section' ? parsed.sectionId : '')),
    target,
    ctx,
    em,
    { mode },
  )
  return { row: authorized.entity as Section, target, actingRole: authorized.actingRole }
}

async function emitLogoChange(ctx: CommandRuntimeContext, result: LogoCommandResult, undo = false): Promise<void> {
  if (result.target.target === 'club') {
    await emitStructure(ctx, result.entity as ClubSettings, 'updated', clubSettingsEvents, undo)
  } else {
    await emitStructure(ctx, result.entity as Section, 'updated', sectionEvents, undo)
  }
}

const setLogoCommand: CommandHandler<Record<string, unknown>, LogoCommandResult> = {
  id: 'club_core.logos.set',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const upload = uploadOf(ctx)
    // Refuse early (403, 404, 409) before any byte is stored; the check repeats on the locked row below.
    const probe = await inWriteTransaction(ctx, 'club_core.logos.set.check', (em) => authorizeLogo(rawInput, ctx, em))
    const scope = trustedScopeOf(ctx)
    if (!scope) throw new Error('[internal] logo upload without a trusted scope')
    const box: { result?: LogoCommandResult } = {}
    const service = attachmentServiceOf(ctx)
    const isClub = probe.target.target === 'club'
    await service.createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: isClub ? CLUB_LOGO_OWNER_ENTITY : SECTION_LOGO_OWNER_ENTITY,
      recordId: probe.row.id,
      partitionCode: CLUB_CORE_PARTITION,
      fileName: upload.fileName,
      declaredMimeType: upload.mimeType,
      buffer: upload.buffer,
      assignments: [{ type: isClub ? CLUB_LOGO_ASSIGNMENT : SECTION_LOGO_ASSIGNMENT, id: probe.row.id }],
      persistLink: async (tx, attachmentId) => {
        const { row, target, actingRole } = await authorizeLogo(rawInput, ctx, tx)
        const before = logoSnapshot(row, target)
        row.logoAttachmentId = attachmentId
        row.updatedAt = new Date()
        await tx.flush()
        box.result = { entity: row, target, actingRole, before }
      },
    })
    const result = box.result
    if (!result) throw new Error('[internal] the logo upload produced no result')
    await emitLogoChange(ctx, result)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: result.target.target === 'club' ? CLUB_SETTINGS_RESOURCE_KIND : 'club_core.section',
      labelKey: 'club_core.audit.logos.set',
      fallback: 'Upload a logo',
      after: logoSnapshot(result.entity, result.target),
    }),
}

const removeLogoCommand: CommandHandler<Record<string, unknown>, LogoCommandResult> = {
  id: 'club_core.logos.remove',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.logos.remove', async (em) => {
      const { row, target, actingRole } = await authorizeLogo(rawInput, ctx, em)
      const before = logoSnapshot(row, target)
      row.logoAttachmentId = null
      row.updatedAt = new Date()
      return { entity: row, target, actingRole, before }
    })
    await emitLogoChange(ctx, result)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: result.target.target === 'club' ? CLUB_SETTINGS_RESOURCE_KIND : 'club_core.section',
      labelKey: 'club_core.audit.logos.remove',
      fallback: 'Remove a logo',
      after: logoSnapshot(result.entity, result.target),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as LogoSnapshot | null | undefined
    const em = ctx.transactionalEm
    if (!em || !before?.id) throw new Error('[internal] logo replay needs the replay transaction and the snapshot')
    await authorizeLogo(replayTarget(before), ctx, em, 'replay')
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as LogoSnapshot | null | undefined
    const em = ctx.transactionalEm
    if (!em || !before?.id) throw new Error('[internal] missing logo snapshot for undo')
    const { row, target, actingRole } = await authorizeLogo(replayTarget(before), ctx, em, 'replay')
    if (row.id !== before.id) throw new Error('[internal] logo snapshot belongs to another row')
    row.logoAttachmentId = before.logoAttachmentId
    row.updatedAt = new Date()
    await em.flush()
    await emitLogoChange(ctx, { entity: row, target, actingRole, before }, true)
  },
}

/** The target of a logged logo change. */
function replayTarget(before: LogoSnapshot): z.input<typeof logoTargetSchema> {
  return before.target === 'club' ? { target: 'club' } : { target: 'section', sectionId: before.id }
}

registerCommand(setLogoCommand)
registerCommand(removeLogoCommand)
