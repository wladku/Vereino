// `club_core.sections.create|update|delete` (club spec glossary *Section*, TEST-001, TEST-032). The club
// administrator manages sections; coordinators are `people` role assignments and are not written here. UX parity spec
// REQ-U02: deactivating or deleting a section — or an undo that would — is refused with 409
// `section_has_active_groups` while `groups.sectionUsage` finds active groups; the section row is locked first by the
// target load, and `groups` reads it `FOR SHARE` when it creates or activates a group (DD-U08). A new or changed name
// is 2–80 characters (422 `section_name_length`, DD-U07) and unique case-insensitively among the club's live sections
// (409 `section_name_taken` from the partial unique index, DD-U05), on undo too.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isUniqueViolation } from '@open-mercato/shared/lib/crud/errors'
import { authorizeScoped, type TargetLock } from '@/modules/foundation'
import { clubCoreErrors } from '../api/errors'
import { Section } from '../data/entities'
import { sectionCreateSchema, sectionDeleteSchema, sectionUpdateSchema } from '../data/validators'
import {
  SECTION_USAGE_LIST_LIMIT,
  needsUsageGuard,
  sectionNameProblem,
  sectionUsageConflict,
  type SectionState,
} from '../lib/section-usage'
import { sectionUsageContract } from '../services/section-usage'
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

/** The partial unique index on the live section names (`data/entities.ts`; its own concurrent migration). */
export const SECTION_NAME_INDEX = 'club_core_sections_org_name_unique'

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

/** Throws a name error with a field error on `name`, so the form shows it next to the field. */
async function throwNameError(code: 'section_name_length' | 'section_name_taken'): Promise<never> {
  const error = await clubCoreErrors.create(code, { field: 'name' })
  error.body = { ...error.body, fieldErrors: { name: String(error.body.error ?? code) } }
  throw error
}

/** Runs a section write and turns a violated name index (23505) into 409 `section_name_taken`. */
async function mappingNameConflict<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error: unknown) {
    if (isUniqueViolation(error, SECTION_NAME_INDEX)) return throwNameError('section_name_taken')
    throw error
  }
}

function stateOf(row: Pick<Section, 'isActive' | 'deletedAt'>): SectionState {
  return { isActive: row.isActive, deleted: Boolean(row.deletedAt) }
}

/**
 * The deactivation guard (DD-U04): when the write moves the section from its current state to `next` and `groups` is
 * enabled, refuses with 409 `section_has_active_groups` (`details: { groups, total }`) while the section has active
 * groups. The caller holds the section's row lock (DD-U08).
 */
async function assertSectionFree(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  row: Section,
  next: SectionState,
): Promise<void> {
  if (!needsUsageGuard(stateOf(row), next)) return
  const contract = sectionUsageContract(ctx.container)
  if (!contract) return
  const usage = await contract.activeGroupsOf(em, {
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    sectionId: row.id,
    limit: SECTION_USAGE_LIST_LIMIT,
  })
  const conflict = sectionUsageConflict(usage)
  if (conflict) await clubCoreErrors.throw('section_has_active_groups', { details: conflict })
}

function replayEm(ctx: CommandRuntimeContext): EntityManager {
  if (!ctx.transactionalEm) throw new Error('[internal] section undo needs the replay transaction')
  return ctx.transactionalEm
}

const createSectionCommand: CommandHandler<Record<string, unknown>, SectionCommandResult> = {
  id: 'club_core.sections.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await mappingNameConflict(() =>
      inWriteTransaction(ctx, 'club_core.sections.create', async (em) => {
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
        const nameProblem = sectionNameProblem(parsed.name, null)
        if (nameProblem) await throwNameError(nameProblem)
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
      }),
    )
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
    // Undoing a create deletes the section: refused once a group lives in it.
    await assertSectionFree(ctx, replayEm(ctx), row, { isActive: row.isActive, deleted: true })
    await undoCreate(ctx, row, sectionEvents)
  },
}

const updateSectionCommand: CommandHandler<Record<string, unknown>, SectionCommandResult> = {
  id: 'club_core.sections.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await mappingNameConflict(() =>
      inWriteTransaction(ctx, 'club_core.sections.update', async (em) => {
        const authorized = await authorizeScoped(
          existingSpec(sectionUpdateSchema, SECTION_RESOURCE_KIND, loader(ctx), true),
          rawInput,
          ctx,
          em,
        )
        const row = authorized.entity as Section
        const before = sectionSnapshot(row)
        const patch = authorized.parsed
        if (patch.name !== undefined) {
          const nameProblem = sectionNameProblem(patch.name, row.name)
          if (nameProblem) await throwNameError(nameProblem)
        }
        const isActive = patch.isActive ?? row.isActive
        await assertSectionFree(ctx, em, row, { isActive, deleted: false })
        if (patch.name !== undefined) row.name = patch.name
        if (patch.description !== undefined) row.description = patch.description
        row.isActive = isActive
        row.updatedAt = new Date()
        return { entity: row, actingRole: authorized.actingRole, before }
      }),
    )
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
    await assertSectionFree(ctx, replayEm(ctx), row, { isActive: before.isActive, deleted: false })
    await mappingNameConflict(() => undoRestore(ctx, row, before, restoreSection, sectionEvents, 'updated'))
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
      await assertSectionFree(ctx, em, row, { isActive: row.isActive, deleted: true })
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
    // A restore never deactivates a live section (the guard skips it), but its name may have been taken meanwhile.
    await mappingNameConflict(() => undoRestore(ctx, row, before, restoreSection, sectionEvents, 'created'))
  },
}

registerCommand(createSectionCommand)
registerCommand(updateSectionCommand)
registerCommand(deleteSectionCommand)
