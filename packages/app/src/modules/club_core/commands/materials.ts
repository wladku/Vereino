// `club_core.materials.create|update|delete` (club spec glossary *Section*: public materials, UI table "Public page"
// group, REQ-025; #29): files of a section — regulations, a declaration form — that the section page lists with the
// `materials` block when they are marked public. Written by the club administrator or the section's coordinator. The
// route checks the format (PDF, PNG, JPEG, WebP) and the size (10 MB) by the file's bytes; the bytes go to the
// platform `attachments` module (private partition) and the material row is the module-owned link written in the
// upload transaction. Create is not undoable (its bytes are not in the stored input; delete is the compensating
// action); update and delete are undoable, and a deleted material keeps its file so the undo finds it.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { SectionMaterial } from '../data/entities'
import { materialCreateSchema, materialDeleteSchema, materialUpdateSchema } from '../data/validators'
import { CLUB_CORE_PARTITION, attachmentServiceOf, uploadOf } from './logos'
import { SECTION_CONTENT_KINDS, sectionContentSpec } from './section-public'
import {
  emitStructure,
  inWriteTransaction,
  structureEvents,
  structureLog,
  trustedTenantId,
  type StructureCommandResult,
} from './shared'

export const MATERIAL_RESOURCE_KIND = 'club_core.section_material'
/** Attachment owner (the section) and assignment (the material) of a material file. */
export const MATERIAL_OWNER_ENTITY = 'club_core:section'
export const MATERIAL_ASSIGNMENT = 'club_core:section_material'

export const materialEvents = structureEvents<SectionMaterial>('section_material')

export type MaterialSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  sectionId: string
  attachmentId: string
  title: string
  fileName: string
  isPublic: boolean
}

export type MaterialCommandResult = StructureCommandResult<SectionMaterial, MaterialSnapshot>

export function materialSnapshot(row: SectionMaterial): MaterialSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    sectionId: row.sectionId,
    attachmentId: row.attachmentId,
    title: row.title,
    fileName: row.fileName,
    isPublic: row.isPublic,
  }
}

function materialLoader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, sectionId: string, lock: TargetLock): Promise<SectionMaterial | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(
      SectionMaterial,
      { id, sectionId, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) },
      lock,
    )
  }
}

/** A material is in the scope of its section: the section's coordinators and the club administrator. */
function materialSpec<TSchema extends z.ZodType<{ id: string; sectionId: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
  includeDeleted = false,
): AuthorizeScopedSpec<TSchema, SectionMaterial> {
  const load = materialLoader(ctx, includeDeleted)
  return {
    input,
    resourceKind: MATERIAL_RESOURCE_KIND,
    allowedKinds: SECTION_CONTENT_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, parsed.sectionId, lock),
    resolveTarget: (_parsed, entity) => {
      const row = entity as SectionMaterial
      return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId, sectionId: row.sectionId }
    },
  }
}

async function authorizeMaterialReplay(
  ctx: CommandRuntimeContext,
  before: MaterialSnapshot | null | undefined,
  includeDeleted: boolean,
): Promise<SectionMaterial> {
  const em = ctx.transactionalEm
  if (!em || !before?.id) throw new Error('[internal] material replay needs the replay transaction and the snapshot')
  const { entity } = await authorizeScoped(
    materialSpec(z.object({ id: z.uuid(), sectionId: z.uuid() }), ctx, includeDeleted),
    { id: before.id, sectionId: before.sectionId },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as SectionMaterial
}

function restoreMaterial(row: SectionMaterial, before: MaterialSnapshot): void {
  row.title = before.title
  row.isPublic = before.isPublic
  row.deletedAt = null
  row.updatedAt = new Date()
}

const createMaterialCommand: CommandHandler<Record<string, unknown>, MaterialCommandResult> = {
  id: 'club_core.materials.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const upload = uploadOf(ctx)
    const fields = materialCreateSchema.parse(rawInput)
    // The section lock token is not needed to add a file: the material is a new row.
    const spec = sectionContentSpec(materialCreateSchema, ctx, (parsed) => parsed.sectionId, 'none')
    await inWriteTransaction(ctx, 'club_core.materials.create.check', (em) => authorizeScoped(spec, fields, ctx, em))
    const scope = trustedScopeOf(ctx)
    if (!scope) throw new Error('[internal] material upload without a trusted scope')
    const id = randomUUID()
    const box: { result?: MaterialCommandResult } = {}
    await attachmentServiceOf(ctx).createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: MATERIAL_OWNER_ENTITY,
      recordId: fields.sectionId,
      partitionCode: CLUB_CORE_PARTITION,
      fileName: upload.fileName,
      declaredMimeType: upload.mimeType,
      buffer: upload.buffer,
      assignments: [{ type: MATERIAL_ASSIGNMENT, id }],
      persistLink: async (tx, attachmentId) => {
        const authorized = await authorizeScoped(spec, fields, ctx, tx)
        const row = tx.create(SectionMaterial, {
          id,
          tenantId: authorized.tenantId,
          organizationId: authorized.organizationId,
          sectionId: fields.sectionId,
          attachmentId,
          title: fields.title,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          fileSize: upload.buffer.length,
          isPublic: fields.isPublic,
        })
        tx.persist(row)
        await tx.flush()
        box.result = { entity: row, actingRole: authorized.actingRole, before: null }
      },
    })
    const result = box.result
    if (!result) throw new Error('[internal] the material upload produced no result')
    await emitStructure(ctx, result.entity, 'created', materialEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: MATERIAL_RESOURCE_KIND,
      labelKey: 'club_core.audit.materials.create',
      fallback: 'Add a section material',
      after: materialSnapshot(result.entity),
    }),
}

const updateMaterialCommand: CommandHandler<Record<string, unknown>, MaterialCommandResult> = {
  id: 'club_core.materials.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.materials.update', async (em) => {
      const authorized = await authorizeScoped(materialSpec(materialUpdateSchema, ctx), rawInput, ctx, em)
      const row = authorized.entity as SectionMaterial
      const before = materialSnapshot(row)
      if (authorized.parsed.title !== undefined) row.title = authorized.parsed.title
      if (authorized.parsed.isPublic !== undefined) row.isPublic = authorized.parsed.isPublic
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'updated', materialEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: MATERIAL_RESOURCE_KIND,
      labelKey: 'club_core.audit.materials.update',
      fallback: 'Change a section material',
      after: materialSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeMaterialReplay(ctx, logEntry.snapshotBefore as MaterialSnapshot | null, false)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as MaterialSnapshot | null | undefined
    const row = await authorizeMaterialReplay(ctx, before, false)
    restoreMaterial(row, before as MaterialSnapshot)
    await ctx.transactionalEm?.flush()
    await emitStructure(ctx, row, 'updated', materialEvents, true)
  },
}

const deleteMaterialCommand: CommandHandler<Record<string, unknown>, MaterialCommandResult> = {
  id: 'club_core.materials.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.materials.delete', async (em) => {
      const authorized = await authorizeScoped(materialSpec(materialDeleteSchema, ctx), rawInput, ctx, em)
      const row = authorized.entity as SectionMaterial
      const before = materialSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'deleted', materialEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: MATERIAL_RESOURCE_KIND,
      labelKey: 'club_core.audit.materials.delete',
      fallback: 'Delete a section material',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeMaterialReplay(ctx, logEntry.snapshotBefore as MaterialSnapshot | null, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as MaterialSnapshot | null | undefined
    const row = await authorizeMaterialReplay(ctx, before, true)
    restoreMaterial(row, before as MaterialSnapshot)
    await ctx.transactionalEm?.flush()
    await emitStructure(ctx, row, 'created', materialEvents, true)
  },
}

registerCommand(createMaterialCommand)
registerCommand(updateMaterialCommand)
registerCommand(deleteMaterialCommand)
