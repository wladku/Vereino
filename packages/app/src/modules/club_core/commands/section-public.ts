// `club_core.sections.update_public` (club spec UI table "Public page" group, DD-29, glossary *Section*; #29): the
// section's public fields — the public switch, the slug, description, conditions and the contact written for
// publication. The club administrator changes any section, a coordinator only the sections they coordinate (403
// `scope_denied` otherwise). A public section needs a slug (422); a slug another live section of the club holds
// answers 409 from the partial unique index. Undoable: the undo writes the previous public fields back.
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { GrantKind } from '@vereino/core'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { z } from 'zod'
import { clubCoreErrors } from '../api/errors'
import { Section } from '../data/entities'
import { sectionPublicUpdateSchema } from '../data/validators'
import { sectionPublicationProblem } from '../lib/publication'
import { sectionEvents } from './sections'
import {
  emitStructure,
  inWriteTransaction,
  isUniqueViolation,
  structureLog,
  structureTarget,
  trustedTenantId,
  type StructureCommandResult,
} from './shared'

/** The club administrator and the section's coordinators (least-privileged first). */
export const SECTION_CONTENT_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']

export const SECTION_PUBLIC_RESOURCE_KIND = 'club_core.section'

export type SectionPublicSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  isPublic: boolean
  publicSlug: string | null
  publicDescription: string | null
  publicConditions: string | null
  publicContactName: string | null
  publicContactEmail: string | null
  publicContactPhone: string | null
}

export type SectionPublicResult = StructureCommandResult<Section, SectionPublicSnapshot>

export function sectionPublicSnapshot(row: Section): SectionPublicSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    isPublic: row.isPublic,
    publicSlug: row.publicSlug ?? null,
    publicDescription: row.publicDescription ?? null,
    publicConditions: row.publicConditions ?? null,
    publicContactName: row.publicContactName ?? null,
    publicContactEmail: row.publicContactEmail ?? null,
    publicContactPhone: row.publicContactPhone ?? null,
  }
}

function restorePublic(row: Section, before: SectionPublicSnapshot): void {
  row.isPublic = before.isPublic
  row.publicSlug = before.publicSlug
  row.publicDescription = before.publicDescription
  row.publicConditions = before.publicConditions
  row.publicContactName = before.publicContactName
  row.publicContactEmail = before.publicContactEmail
  row.publicContactPhone = before.publicContactPhone
  row.updatedAt = new Date()
}

/** Loads and row-locks a live section of the trusted tenant. */
export function sectionLoader(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Section | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Section, { id, tenantId, deletedAt: null }, lock)
  }
}

/** The spec of a command on a section's public content: the section's coordinators or the club administrator. */
export function sectionContentSpec<TSchema extends z.ZodType>(
  input: TSchema,
  ctx: CommandRuntimeContext,
  sectionIdOf: (parsed: z.output<TSchema>) => string,
  lock: 'updated_at' | 'none' = 'updated_at',
): AuthorizeScopedSpec<TSchema, Section> {
  const load = sectionLoader(ctx)
  return {
    input,
    resourceKind: SECTION_PUBLIC_RESOURCE_KIND,
    allowedKinds: SECTION_CONTENT_KINDS,
    loadTarget: (parsed, em, targetLock) => load(em, sectionIdOf(parsed), targetLock),
    resolveTarget: (_parsed, entity) => structureTarget(entity as Section, true),
    lock,
  }
}

async function authorizePublicReplay(ctx: CommandRuntimeContext, id: string | null | undefined): Promise<Section> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] section public replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    sectionContentSpec(z.object({ id: z.uuid() }), ctx, (parsed) => parsed.id),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Section
}

const updateSectionPublicCommand: CommandHandler<Record<string, unknown>, SectionPublicResult> = {
  id: 'club_core.sections.update_public',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    let result: SectionPublicResult
    try {
      result = await inWriteTransaction(ctx, 'club_core.sections.update_public', async (em) => {
        const authorized = await authorizeScoped(
          sectionContentSpec(sectionPublicUpdateSchema, ctx, (parsed) => parsed.id),
          rawInput,
          ctx,
          em,
        )
        const row = authorized.entity as Section
        const before = sectionPublicSnapshot(row)
        const patch = authorized.parsed
        if (patch.isPublic !== undefined) row.isPublic = patch.isPublic
        if (patch.publicSlug !== undefined) row.publicSlug = patch.publicSlug
        if (patch.publicDescription !== undefined) row.publicDescription = patch.publicDescription
        if (patch.publicConditions !== undefined) row.publicConditions = patch.publicConditions
        if (patch.publicContactName !== undefined) row.publicContactName = patch.publicContactName
        if (patch.publicContactEmail !== undefined) row.publicContactEmail = patch.publicContactEmail
        if (patch.publicContactPhone !== undefined) row.publicContactPhone = patch.publicContactPhone
        const problem = sectionPublicationProblem({ isPublic: row.isPublic, publicSlug: row.publicSlug ?? null })
        if (problem) await clubCoreErrors.throw(problem)
        row.updatedAt = new Date()
        return { entity: row, actingRole: authorized.actingRole, before }
      })
    } catch (error: unknown) {
      if (isUniqueViolation(error)) return clubCoreErrors.throw('public_slug_taken')
      throw error
    }
    await emitStructure(ctx, result.entity, 'updated', sectionEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: SECTION_PUBLIC_RESOURCE_KIND,
      labelKey: 'club_core.audit.sections.update_public',
      fallback: "Change a section's public page",
      after: sectionPublicSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePublicReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as SectionPublicSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing section public snapshot for undo')
    const row = await authorizePublicReplay(ctx, before.id)
    restorePublic(row, before)
    await ctx.transactionalEm?.flush()
    await emitStructure(ctx, row, 'updated', sectionEvents, true)
  },
}

registerCommand(updateSectionPublicCommand)
