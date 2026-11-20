// `activities.club_event_files.add|delete` (club events spec DD-T10, REQ-T08, TEST-T08; #379): the poster and the
// funder logos of a club event, written by its managers (the club administrator; a coordinator of the event's
// section). The route checks the format and the size by the file's bytes; the bytes go to the platform `attachments`
// module (private partition, owner `activities:club_event`, assignment `activities:club_event_file`) and the link row
// is written in the upload transaction (`persistLink`) after the event row is locked again (`FOR UPDATE`): the logos
// are counted under that lock, so two parallel uploads at 11 logos end with 12, and a new poster soft-deletes the live
// one before its own row is written (the partial unique index `activities_club_event_files_poster_unique` requires it).
//
// Both commands are undoable. The undo of an add removes the new link and puts back the poster it replaced; its redo
// links the same stored file again (the bytes are not part of the stored input, so a redo never re-uploads). The undo
// of a delete restores the link (a logo keeps its position; a poster only while no newer poster is live, 409
// `club_event_poster_replaced` otherwise). Removing a link keeps the file in `attachments`, so every undo finds it. No events: the audit log records
// every change.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { ActingRole } from '@vereino/core'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { ClubEvent, ClubEventFile } from '../data/entities'
import { clubEventFileAddSchema, clubEventFileDeleteSchema } from '../data/validators'
import {
  CLUB_EVENT_FILE_ASSIGNMENT,
  CLUB_EVENT_FILE_OWNER_ENTITY,
  CLUB_EVENT_FILE_PARTITION,
  funderNameOf,
  fundersLimitReached,
  nextFilePosition,
  type ClubEventFileKind,
} from '../lib/club-event-files'
import { CLUB_EVENT_MANAGE_KINDS, clubEventTarget } from '../services/club-event-scope'
import { assertClubEventOpen } from './club-events'
import { activitiesLog, inWriteTransaction, trustedTenantId, type ActivitiesCommandResult } from './shared'

export const CLUB_EVENT_FILE_RESOURCE_KIND = 'activities.club_event_file'

/** Where the route hands the checked upload to the command (never part of the stored command input). */
const CLUB_EVENT_UPLOAD_CONTEXT = Symbol.for('vereino.activities.club_event_upload')

export type CheckedClubEventUpload = { buffer: Buffer; fileName: string; mimeType: string }

type UploadContext = CommandRuntimeContext & { [CLUB_EVENT_UPLOAD_CONTEXT]?: CheckedClubEventUpload }

/** The command context carrying a checked upload. */
export function withClubEventUpload(ctx: CommandRuntimeContext, upload: CheckedClubEventUpload): CommandRuntimeContext {
  return Object.assign(ctx, { [CLUB_EVENT_UPLOAD_CONTEXT]: upload })
}

function uploadOf(ctx: CommandRuntimeContext): CheckedClubEventUpload {
  const upload = (ctx as UploadContext)[CLUB_EVENT_UPLOAD_CONTEXT]
  if (!upload || !Buffer.isBuffer(upload.buffer)) throw new CrudHttpError(400, { error: 'File is required' })
  return upload
}

/** The platform attachment service, or 503 when the `attachments` module is not enabled. */
function attachmentServiceOf(ctx: CommandRuntimeContext): AttachmentService {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  return ctx.container.resolve<AttachmentService>('attachmentService')
}

export type ClubEventFileSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  clubEventId: string
  attachmentId: string
  kind: ClubEventFileKind
  funderName: string | null
  position: number
  fileName: string
  /** The poster an added poster replaced, so the undo of the add puts it back. */
  replacedId?: string | null
}

export type ClubEventFileCommandResult = ActivitiesCommandResult<ClubEventFile, ClubEventFileSnapshot> & {
  /** The poster a new poster replaced, if any. */
  replacedId: string | null
}

export function clubEventFileSnapshot(row: ClubEventFile): ClubEventFileSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    clubEventId: row.clubEventId,
    attachmentId: row.attachmentId,
    kind: row.kind,
    funderName: row.funderName ?? null,
    position: row.position,
    fileName: row.fileName,
  }
}

type Scope = { tenantId: string; organizationId: string }

const scopeOf = (row: Scope): Scope => ({ tenantId: row.tenantId, organizationId: row.organizationId })

/** The live club event, row-locked in the trusted tenant: the lock serializes the logo count and the poster swap. */
function eventSpec(ctx: CommandRuntimeContext): AuthorizeScopedSpec<typeof clubEventFileAddSchema, ClubEvent> {
  return {
    input: clubEventFileAddSchema,
    resourceKind: CLUB_EVENT_FILE_RESOURCE_KIND,
    allowedKinds: CLUB_EVENT_MANAGE_KINDS,
    loadTarget: (parsed, em, lock) => {
      const tenantId = trustedTenantId(ctx)
      if (!tenantId) return Promise.resolve(null)
      return em.findOne(ClubEvent, { id: parsed.clubEventId, tenantId, deletedAt: null }, lock)
    },
    resolveTarget: (_parsed, entity) => clubEventTarget(entity as ClubEvent),
    // A file is a new row of its own; the event's lock token is not needed to add one.
    lock: 'none',
  }
}

/** A file and its event as one target: the file's `updated_at` is the lock token of a delete. */
type FileTarget = { updatedAt: Date; file: ClubEventFile; event: ClubEvent }

/** A file of a live club event; the event row is locked first, so a restore counts the logos like an upload does. */
function fileSpec<TSchema extends z.ZodType<{ clubEventId: string; id: string }>>(
  ctx: CommandRuntimeContext,
  input: TSchema,
  includeDeleted = false,
): AuthorizeScopedSpec<TSchema, FileTarget> {
  return {
    input,
    resourceKind: CLUB_EVENT_FILE_RESOURCE_KIND,
    allowedKinds: CLUB_EVENT_MANAGE_KINDS,
    loadTarget: async (parsed, em, lock: TargetLock) => {
      const tenantId = trustedTenantId(ctx)
      if (!tenantId) return null
      const event = await em.findOne(ClubEvent, { id: parsed.clubEventId, tenantId, deletedAt: null }, lock)
      if (!event) return null
      const file = await em.findOne(
        ClubEventFile,
        {
          id: parsed.id,
          tenantId,
          organizationId: event.organizationId,
          clubEventId: event.id,
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
        lock,
      )
      return file ? { updatedAt: file.updatedAt, file, event } : null
    },
    resolveTarget: (_parsed, entity) => clubEventTarget((entity as FileTarget).event),
  }
}

/** The replay of a file write is authorized like the write: the event's managers, the file found with deleted rows. */
async function authorizeFileReplay(
  ctx: CommandRuntimeContext,
  snapshot: { id?: string; clubEventId?: string } | null | undefined,
): Promise<FileTarget & { actingRole: ActingRole }> {
  const em = ctx.transactionalEm
  if (!em || !snapshot?.id || !snapshot.clubEventId) {
    throw new Error('[internal] club event file replay needs the replay transaction and the ids')
  }
  const authorized = await authorizeScoped(
    fileSpec(ctx, z.object({ clubEventId: z.uuid(), id: z.uuid() }), true),
    { clubEventId: snapshot.clubEventId, id: snapshot.id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return { ...(authorized.entity as FileTarget), actingRole: authorized.actingRole }
}

/** The positions of the event's live funder logos. */
async function liveLogoPositions(em: EntityManager, scope: Scope, clubEventId: string): Promise<number[]> {
  const rows = await em.find(
    ClubEventFile,
    { ...scope, clubEventId, kind: 'funder_logo', deletedAt: null },
    { fields: ['id', 'position'] },
  )
  return rows.map((row) => row.position)
}

/** Refuses a thirteenth live logo (422 `club_event_funders_limit`); returns the next position otherwise. */
async function nextLogoSlot(em: EntityManager, scope: Scope, clubEventId: string): Promise<number> {
  const positions = await liveLogoPositions(em, scope, clubEventId)
  if (fundersLimitReached(positions.length)) await activitiesErrors.throw('club_event_funders_limit', { field: 'file' })
  return nextFilePosition(positions)
}

/** Soft-deletes the event's live poster other than `keepId`, if any, and returns its id. */
async function retirePoster(
  em: EntityManager,
  scope: Scope,
  clubEventId: string,
  keepId: string | null = null,
): Promise<string | null> {
  const current = await em.findOne(ClubEventFile, {
    ...scope,
    clubEventId,
    kind: 'poster',
    deletedAt: null,
    ...(keepId ? { id: { $ne: keepId } } : {}),
  })
  if (!current) return null
  const now = new Date()
  current.deletedAt = now
  current.updatedAt = now
  await em.flush()
  return current.id
}

/**
 * Puts a removed link back: a logo must still fit the limit and keeps its position; a poster replaces the live one
 * (returned, so the caller may record it).
 */
async function relink(em: EntityManager, row: ClubEventFile): Promise<string | null> {
  if (!row.deletedAt) return null
  const scope = scopeOf(row)
  let replacedId: string | null = null
  if (row.kind === 'funder_logo') {
    const positions = await liveLogoPositions(em, scope, row.clubEventId)
    if (fundersLimitReached(positions.length)) await activitiesErrors.throw('club_event_funders_limit')
  } else {
    replacedId = await retirePoster(em, scope, row.clubEventId, row.id)
  }
  row.deletedAt = null
  row.updatedAt = new Date()
  await em.flush()
  return replacedId
}

/** The funder's name of the input (null for a poster); 422 `club_event_funder_name_invalid` for a logo without one. */
async function funderName(kind: ClubEventFileKind, raw: string | null | undefined): Promise<string | null> {
  const checked = funderNameOf(kind, raw)
  if (!checked.valid) return activitiesErrors.throw('club_event_funder_name_invalid', { field: 'funderName' })
  return checked.name
}

const addClubEventFileCommand: CommandHandler<Record<string, unknown>, ClubEventFileCommandResult> = {
  id: 'activities.club_event_files.add',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const upload = uploadOf(ctx)
    const fields = clubEventFileAddSchema.parse(rawInput)
    const name = await funderName(fields.kind, fields.funderName)
    const spec = eventSpec(ctx)
    // An early refusal before the bytes are stored; the count is repeated under the lock in `persistLink`.
    await inWriteTransaction(ctx, 'activities.club_event_files.add.check', async (em) => {
      const authorized = await authorizeScoped(spec, fields, ctx, em)
      const event = authorized.entity as ClubEvent
      await assertClubEventOpen(event)
      if (fields.kind === 'funder_logo') await nextLogoSlot(em, scopeOf(event), event.id)
      return true
    })
    const scope = trustedScopeOf(ctx)
    if (!scope) throw new Error('[internal] club event file upload without a trusted scope')
    const id = randomUUID()
    const box: { result?: ClubEventFileCommandResult } = {}
    await attachmentServiceOf(ctx).createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: CLUB_EVENT_FILE_OWNER_ENTITY,
      recordId: fields.clubEventId,
      partitionCode: CLUB_EVENT_FILE_PARTITION,
      fileName: upload.fileName,
      declaredMimeType: upload.mimeType,
      buffer: upload.buffer,
      assignments: [{ type: CLUB_EVENT_FILE_ASSIGNMENT, id }],
      persistLink: async (tx, attachmentId) => {
        const authorized = await authorizeScoped(spec, fields, ctx, tx)
        const event = authorized.entity as ClubEvent
        await assertClubEventOpen(event)
        const eventScope = scopeOf(event)
        let position = 0
        let replacedId: string | null = null
        if (fields.kind === 'funder_logo') position = await nextLogoSlot(tx, eventScope, event.id)
        else replacedId = await retirePoster(tx, eventScope, event.id)
        const row = tx.create(ClubEventFile, {
          id,
          ...eventScope,
          clubEventId: event.id,
          attachmentId,
          kind: fields.kind,
          funderName: name,
          position,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          fileSize: upload.buffer.length,
        })
        tx.persist(row)
        await tx.flush()
        box.result = { entity: row, actingRole: authorized.actingRole, before: null, replacedId }
      },
    })
    const result = box.result
    if (!result) throw new Error('[internal] the club event file upload produced no result')
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_FILE_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEventFiles.add',
      fallback: 'Add a file to a club event',
      after: { ...clubEventFileSnapshot(result.entity), replacedId: result.replacedId },
      parent: { resourceKind: 'activities.club_event', resourceId: result.entity.clubEventId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeFileReplay(ctx, logEntry.snapshotAfter as ClubEventFileSnapshot | null)
  },
  /** Removes the new link and, when it is still the poster that replaced another, puts the replaced one back. */
  async undo({ ctx, logEntry }) {
    const after = logEntry.snapshotAfter as ClubEventFileSnapshot | null | undefined
    const { file, event } = await authorizeFileReplay(ctx, after)
    await assertClubEventOpen(event)
    const em = ctx.transactionalEm as EntityManager
    if (file.deletedAt) return
    const now = new Date()
    file.deletedAt = now
    file.updatedAt = now
    await em.flush()
    if (file.kind !== 'poster' || !after?.replacedId) return
    const replaced = await em.findOne(ClubEventFile, {
      ...scopeOf(file),
      id: after.replacedId,
      clubEventId: file.clubEventId,
    })
    if (replaced) await relink(em, replaced)
  },
  /** Links the same stored file again (the bytes are not in the stored input); a poster replaces the live one. */
  async redo({ ctx, logEntry }) {
    const after = logEntry.snapshotAfter as ClubEventFileSnapshot | null | undefined
    return inWriteTransaction(ctx, 'activities.club_event_files.add.redo', async (em) => {
      const { file, event, actingRole } = await authorizeFileReplay(ctx, after)
      await assertClubEventOpen(event)
      const replacedId = await relink(em, file)
      return { entity: file, actingRole, before: null, replacedId }
    })
  },
}

const deleteClubEventFileCommand: CommandHandler<Record<string, unknown>, ClubEventFileCommandResult> = {
  id: 'activities.club_event_files.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'activities.club_event_files.delete', async (em) => {
      const authorized = await authorizeScoped(fileSpec(ctx, clubEventFileDeleteSchema), rawInput, ctx, em)
      const { file, event } = authorized.entity as FileTarget
      await assertClubEventOpen(event)
      const before = clubEventFileSnapshot(file)
      const now = new Date()
      file.deletedAt = now
      file.updatedAt = now
      return { entity: file, actingRole: authorized.actingRole, before, replacedId: null }
    })
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_FILE_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEventFiles.delete',
      fallback: 'Remove a file of a club event',
      after: null,
      parent: { resourceKind: 'activities.club_event', resourceId: result.entity.clubEventId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeFileReplay(ctx, logEntry.snapshotBefore as ClubEventFileSnapshot | null)
  },
  /**
   * Restores the link: a logo with its position (within the limit). A poster comes back only while the event has no
   * live poster: one uploaded since stays, and the undo answers 409 `club_event_poster_replaced` (replacing it here
   * would lose it, since no log entry records the swap).
   */
  async undo({ ctx, logEntry }) {
    const { file, event } = await authorizeFileReplay(ctx, logEntry.snapshotBefore as ClubEventFileSnapshot | null)
    await assertClubEventOpen(event)
    const em = ctx.transactionalEm as EntityManager
    if (file.deletedAt && file.kind === 'poster') {
      const live = await em.findOne(
        ClubEventFile,
        { ...scopeOf(file), clubEventId: file.clubEventId, kind: 'poster', deletedAt: null, id: { $ne: file.id } },
        { fields: ['id'] },
      )
      if (live) await activitiesErrors.throw('club_event_poster_replaced')
    }
    await relink(em, file)
  },
}

registerCommand(addClubEventFileCommand)
registerCommand(deleteClubEventFileCommand)
