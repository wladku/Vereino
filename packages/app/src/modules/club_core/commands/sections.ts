// `club_core.sections.create|update|delete` (club spec glossary *Section*, TEST-001, TEST-032). The club
// administrator manages sections; coordinators are `people` role assignments and are not written here. Deleting or
// deactivating a section that has groups (409) arrives with the `groups` module (phase 2); until then a delete is a
// soft delete.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { authorizeScoped, type TargetLock } from '@/modules/foundation'
import { Section } from '../data/entities'
import { sectionCreateSchema, sectionDeleteSchema, sectionUpdateSchema } from '../data/validators'
import {
  STRUCTURE_WRITE_KINDS,
  authorizeReplay,
  emitStructure,
  existingSpec,
  inWriteTransaction,
  structureEvents,
  structureLog,
  structureTarget,
  trustedTenantId,
  undoCreate,
  undoRestore,
  type StructureCommandResult,
} from './shared'

export const SECTION_RESOURCE_KIND = 'club_core.section'

export const sectionEvents = structureEvents<Section>('section')

export type SectionSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  name: string
  description: string | null
  isActive: boolean
}

export type SectionCommandResult = StructureCommandResult<Section, SectionSnapshot>

export function sectionSnapshot(row: Section): SectionSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    isActive: row.isActive,
  }
}

function restoreSection(row: Section, before: SectionSnapshot): void {
  row.name = before.name
  row.description = before.description
  row.isActive = before.isActive
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Section | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Section, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

const createSectionCommand: CommandHandler<Record<string, unknown>, SectionCommandResult> = {
  id: 'club_core.sections.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'club_core.sections.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: sectionCreateSchema,
          resourceKind: SECTION_RESOURCE_KIND,
          allowedKinds: STRUCTURE_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => structureTarget({ id, ...scope }, true),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const row = em.create(Section, {
        id,
        tenantId,
        organizationId,
        name: parsed.name,
        description: parsed.description ?? null,
        isActive: parsed.isActive ?? true,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitStructure(ctx, result.entity, 'created', sectionEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: SECTION_RESOURCE_KIND,
      labelKey: 'club_core.audit.sections.create',
      fallback: 'Create a section',
      after: sectionSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, SECTION_RESOURCE_KIND, logEntry.resourceId, loader(ctx), true)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeReplay(ctx, SECTION_RESOURCE_KIND, logEntry.resourceId, loader(ctx), true)
    await undoCreate(ctx, row, sectionEvents)
  },
}

const updateSectionCommand: CommandHandler<Record<string, unknown>, SectionCommandResult> = {
  id: 'club_core.sections.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.sections.update', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(sectionUpdateSchema, SECTION_RESOURCE_KIND, loader(ctx), true),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Section
      const before = sectionSnapshot(row)
      const patch = authorized.parsed
      if (patch.name !== undefined) row.name = patch.name
      if (patch.description !== undefined) row.description = patch.description
      if (patch.isActive !== undefined) row.isActive = patch.isActive
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'updated', sectionEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: SECTION_RESOURCE_KIND,
      labelKey: 'club_core.audit.sections.update',
      fallback: 'Change a section',
      after: sectionSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, SECTION_RESOURCE_KIND, logEntry.resourceId, loader(ctx), true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as SectionSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing section snapshot for undo')
    const row = await authorizeReplay(ctx, SECTION_RESOURCE_KIND, before.id, loader(ctx), true)
    await undoRestore(ctx, row, before, restoreSection, sectionEvents, 'updated')
  },
}

const deleteSectionCommand: CommandHandler<Record<string, unknown>, SectionCommandResult> = {
  id: 'club_core.sections.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.sections.delete', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(sectionDeleteSchema, SECTION_RESOURCE_KIND, loader(ctx), true),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Section
      const before = sectionSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'deleted', sectionEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: SECTION_RESOURCE_KIND,
      labelKey: 'club_core.audit.sections.delete',
      fallback: 'Delete a section',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, SECTION_RESOURCE_KIND, logEntry.resourceId, loader(ctx, true), true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as SectionSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing section snapshot for undo')
    const row = await authorizeReplay(ctx, SECTION_RESOURCE_KIND, before.id, loader(ctx, true), true)
    await undoRestore(ctx, row, before, restoreSection, sectionEvents, 'created')
  },
}

registerCommand(createSectionCommand)
registerCommand(updateSectionCommand)
registerCommand(deleteSectionCommand)
