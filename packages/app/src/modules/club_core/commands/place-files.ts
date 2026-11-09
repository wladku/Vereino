// `club_core.places.files.add` and `club_core.places.files.delete` (UX parity spec, REQ-U03, DD-U06; #86): a place's
// photos (PNG, JPEG or WebP up to 5 MB, at most 10) and its one regulations PDF (up to 10 MB). Written by the club
// administrator. The route checks the format and the size by the file's bytes; the bytes go to the platform
// `attachments` module (private partition) and the link row is written in the upload transaction (`persistLink`),
// after the place row is locked again: photos are counted under that lock, so two parallel uploads at 9 photos end
// with 10, and a second regulations PDF replaces the first (the old link is soft-deleted before the new one is
// written, which the partial unique index requires). Add is not undoable (its bytes are not in the stored input;
// delete is the compensating action); delete is undoable and keeps the file, so the undo finds it. The spec adds no
// events for place files; the audit log records every change.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { clubCoreErrors } from '../api/errors'
import { Place, PlaceFile } from '../data/entities'
import { placeFileAddSchema, placeFileDeleteSchema } from '../data/validators'
import { PLACE_FILE_ASSIGNMENT, PLACE_FILE_OWNER_ENTITY, PLACE_PHOTOS_MAX, nextPhotoPosition } from '../lib/files'
import { CLUB_CORE_PARTITION, attachmentServiceOf, uploadOf } from './logos'
import { PLACE_RESOURCE_KIND } from './places'
import {
  STRUCTURE_WRITE_KINDS,
  inWriteTransaction,
  structureLog,
  structureTarget,
  trustedTenantId,
  type StructureCommandResult,
} from './shared'

export const PLACE_FILE_RESOURCE_KIND = 'club_core.place_file'

export type PlaceFileSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  attachmentId: string
  kind: string
  position: number
  fileName: string
}

export type PlaceFileCommandResult = StructureCommandResult<PlaceFile, PlaceFileSnapshot> & {
  /** The regulations file a new regulations PDF replaced, if any. */
  replacedId?: string | null
}

export function placeFileSnapshot(row: PlaceFile): PlaceFileSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    attachmentId: row.attachmentId,
    kind: row.kind,
    position: row.position,
    fileName: row.fileName,
  }
}

type Scope = { tenantId: string; organizationId: string }

/** The live place, row-locked in the trusted tenant: the lock serializes the photo count and the regulations swap. */
function placeSpec<TSchema extends z.ZodType<{ placeId: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
): AuthorizeScopedSpec<TSchema, Place> {
  return {
    input,
    resourceKind: PLACE_RESOURCE_KIND,
    allowedKinds: STRUCTURE_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => {
      const tenantId = trustedTenantId(ctx)
      if (!tenantId) return Promise.resolve(null)
      return em.findOne(Place, { id: parsed.placeId, tenantId, deletedAt: null }, lock)
    },
    resolveTarget: (_parsed, entity) => structureTarget(entity as Place),
    // A file is a new row of its own; the place's lock token is not needed to add one.
    lock: 'none',
  }
}

/** A file of a live place; the place row is locked first, so a restore counts the photos like an upload does. */
function placeFileSpec<TSchema extends z.ZodType<{ id: string; placeId: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
  includeDeleted = false,
): AuthorizeScopedSpec<TSchema, PlaceFile> {
  return {
    input,
    resourceKind: PLACE_FILE_RESOURCE_KIND,
    allowedKinds: STRUCTURE_WRITE_KINDS,
    loadTarget: async (parsed, em, lock: TargetLock) => {
      const tenantId = trustedTenantId(ctx)
      if (!tenantId) return null
      const place = await em.findOne(Place, { id: parsed.placeId, tenantId, deletedAt: null }, lock)
      if (!place) return null
      return em.findOne(
        PlaceFile,
        { id: parsed.id, placeId: place.id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) },
        lock,
      )
    },
    resolveTarget: (_parsed, entity) => structureTarget(entity as PlaceFile),
    // A file link has no editable fields, so it carries no lock token.
    lock: 'none',
  }
}

/** The positions of the place's live photos. */
async function livePhotoPositions(em: EntityManager, scope: Scope, placeId: string): Promise<number[]> {
  const rows = await em.find(
    PlaceFile,
    { ...scope, placeId, kind: 'photo', deletedAt: null },
    { fields: ['id', 'position'] },
  )
  return rows.map((row) => row.position)
}

/** Refuses an eleventh live photo (422 `place_photos_limit_reached`); returns the next position otherwise. */
async function nextPhotoSlot(em: EntityManager, scope: Scope, placeId: string): Promise<number> {
  const positions = await livePhotoPositions(em, scope, placeId)
  if (positions.length >= PLACE_PHOTOS_MAX) await clubCoreErrors.throw('place_photos_limit_reached', { field: 'file' })
  return nextPhotoPosition(positions)
}

/** Soft-deletes the place's live regulations file, if any, and returns its id. */
async function retireRegulations(em: EntityManager, scope: Scope, placeId: string): Promise<string | null> {
  const current = await em.findOne(PlaceFile, { ...scope, placeId, kind: 'regulations', deletedAt: null })
  if (!current) return null
  current.deletedAt = new Date()
  current.updatedAt = new Date()
  await em.flush()
  return current.id
}

const addPlaceFileCommand: CommandHandler<Record<string, unknown>, PlaceFileCommandResult> = {
  id: 'club_core.places.files.add',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const upload = uploadOf(ctx)
    const fields = placeFileAddSchema.parse(rawInput)
    const spec = placeSpec(placeFileAddSchema, ctx)
    // An early refusal before the bytes are stored; the count is repeated under the lock in `persistLink`.
    await inWriteTransaction(ctx, 'club_core.places.files.add.check', async (em) => {
      const authorized = await authorizeScoped(spec, fields, ctx, em)
      if (fields.kind === 'photo') {
        await nextPhotoSlot(
          em,
          { tenantId: authorized.tenantId, organizationId: authorized.organizationId },
          fields.placeId,
        )
      }
      return true
    })
    const scope = trustedScopeOf(ctx)
    if (!scope) throw new Error('[internal] place file upload without a trusted scope')
    const id = randomUUID()
    const box: { result?: PlaceFileCommandResult } = {}
    await attachmentServiceOf(ctx).createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: PLACE_FILE_OWNER_ENTITY,
      recordId: fields.placeId,
      partitionCode: CLUB_CORE_PARTITION,
      fileName: upload.fileName,
      declaredMimeType: upload.mimeType,
      buffer: upload.buffer,
      assignments: [{ type: PLACE_FILE_ASSIGNMENT, id }],
      persistLink: async (tx, attachmentId) => {
        const authorized = await authorizeScoped(spec, fields, ctx, tx)
        const placeScope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
        let position = 0
        let replacedId: string | null = null
        if (fields.kind === 'photo') position = await nextPhotoSlot(tx, placeScope, fields.placeId)
        else replacedId = await retireRegulations(tx, placeScope, fields.placeId)
        const row = tx.create(PlaceFile, {
          id,
          ...placeScope,
          placeId: fields.placeId,
          attachmentId,
          kind: fields.kind,
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
    if (!result) throw new Error('[internal] the place file upload produced no result')
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: PLACE_FILE_RESOURCE_KIND,
      labelKey: 'club_core.audit.place_files.add',
      fallback: 'Add a place file',
      after: placeFileSnapshot(result.entity),
    }),
}

async function authorizePlaceFileReplay(
  ctx: CommandRuntimeContext,
  before: PlaceFileSnapshot | null | undefined,
): Promise<PlaceFile> {
  const em = ctx.transactionalEm
  if (!em || !before?.id) throw new Error('[internal] place file replay needs the replay transaction and the snapshot')
  const { entity } = await authorizeScoped(
    placeFileSpec(z.object({ id: z.uuid(), placeId: z.uuid() }), ctx, true),
    { id: before.id, placeId: before.placeId },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as PlaceFile
}

const deletePlaceFileCommand: CommandHandler<Record<string, unknown>, PlaceFileCommandResult> = {
  id: 'club_core.places.files.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'club_core.places.files.delete', async (em) => {
      const authorized = await authorizeScoped(placeFileSpec(placeFileDeleteSchema, ctx), rawInput, ctx, em)
      const row = authorized.entity as PlaceFile
      const before = placeFileSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: PLACE_FILE_RESOURCE_KIND,
      labelKey: 'club_core.audit.place_files.delete',
      fallback: 'Remove a place file',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePlaceFileReplay(ctx, logEntry.snapshotBefore as PlaceFileSnapshot | null)
  },
  /**
   * Restores the link under the place lock: a restored photo still counts against the limit, and a restored
   * regulations file replaces the one uploaded since (the replaced file can be restored again from its own removal).
   */
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as PlaceFileSnapshot | null | undefined
    const row = await authorizePlaceFileReplay(ctx, before)
    const em = ctx.transactionalEm as EntityManager
    if (!row.deletedAt) return
    const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
    if (row.kind === 'photo') {
      const positions = await livePhotoPositions(em, scope, row.placeId)
      if (positions.length >= PLACE_PHOTOS_MAX) await clubCoreErrors.throw('place_photos_limit_reached')
    } else {
      await retireRegulations(em, scope, row.placeId)
    }
    row.deletedAt = null
    row.updatedAt = new Date()
    await em.flush()
  },
}

registerCommand(addPlaceFileCommand)
registerCommand(deletePlaceFileCommand)
