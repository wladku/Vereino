// `club_core.institutions.create|update|delete` (club spec *Data Models* → `club_core_institutions`, TEST-001). The
// club administrator manages institutions; contact, bank account and notes are encrypted at rest (`encryption.ts`).
// Delete is a soft delete, refused while a live place names the institution as its owner (409 `institution_in_use`).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { authorizeScoped, type TargetLock } from '@/modules/foundation'
import { clubCoreErrors } from '../api/errors'
import { Institution } from '../data/entities'
import { countPlacesOwnedBy, lockPlaceHierarchy } from '../data/queries'
import { institutionCreateSchema, institutionDeleteSchema, institutionUpdateSchema } from '../data/validators'
import {
  STRUCTURE_WRITE_KINDS,
  authorizeReplay,
  decryptionScope,
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

export const INSTITUTION_RESOURCE_KIND = 'club_core.institution'

export const institutionEvents = structureEvents<Institution>('institution')

export type InstitutionSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  name: string
  type: string
  address: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  bankAccount: string | null
  notes: string | null
}

export type InstitutionCommandResult = StructureCommandResult<Institution, InstitutionSnapshot>

export function institutionSnapshot(row: Institution): InstitutionSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    name: row.name,
    type: row.type,
    address: row.address ?? null,
    contactName: row.contactName ?? null,
    contactPhone: row.contactPhone ?? null,
    contactEmail: row.contactEmail ?? null,
    bankAccount: row.bankAccount ?? null,
    notes: row.notes ?? null,
  }
}

function restoreInstitution(row: Institution, before: InstitutionSnapshot): void {
  row.name = before.name
  row.type = before.type
  row.address = before.address
  row.contactName = before.contactName
  row.contactPhone = before.contactPhone
  row.contactEmail = before.contactEmail
  row.bankAccount = before.bankAccount
  row.notes = before.notes
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Institution | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    const where = { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }
    return findOneWithDecryption(em, Institution, where, lock, decryptionScope(ctx))
  }
}

const createInstitutionCommand: CommandHandler<Record<string, unknown>, InstitutionCommandResult> = {
  id: 'club_core.institutions.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'club_core.institutions.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: institutionCreateSchema,
          resourceKind: INSTITUTION_RESOURCE_KIND,
          allowedKinds: STRUCTURE_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => structureTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const row = em.create(Institution, {
        id,
        tenantId,
        organizationId,
        name: parsed.name,
        type: parsed.type,
        address: parsed.address ?? null,
        contactName: parsed.contactName ?? null,
        contactPhone: parsed.contactPhone ?? null,
        contactEmail: parsed.contactEmail ?? null,
        bankAccount: parsed.bankAccount ?? null,
        notes: parsed.notes ?? null,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitStructure(ctx, result.entity, 'created', institutionEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: INSTITUTION_RESOURCE_KIND,
      labelKey: 'club_core.audit.institutions.create',
      fallback: 'Create an institution',
      after: institutionSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, INSTITUTION_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeReplay(ctx, INSTITUTION_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
    await undoCreate(ctx, row, institutionEvents)
  },
}

const updateInstitutionCommand: CommandHandler<Record<string, unknown>, InstitutionCommandResult> = {
  id: 'club_core.institutions.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.institutions.update', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(institutionUpdateSchema, INSTITUTION_RESOURCE_KIND, loader(ctx)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Institution
      const before = institutionSnapshot(row)
      const patch = authorized.parsed
      if (patch.name !== undefined) row.name = patch.name
      if (patch.type !== undefined) row.type = patch.type
      if (patch.address !== undefined) row.address = patch.address
      if (patch.contactName !== undefined) row.contactName = patch.contactName
      if (patch.contactPhone !== undefined) row.contactPhone = patch.contactPhone
      if (patch.contactEmail !== undefined) row.contactEmail = patch.contactEmail
      if (patch.bankAccount !== undefined) row.bankAccount = patch.bankAccount
      if (patch.notes !== undefined) row.notes = patch.notes
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'updated', institutionEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: INSTITUTION_RESOURCE_KIND,
      labelKey: 'club_core.audit.institutions.update',
      fallback: 'Change an institution',
      after: institutionSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, INSTITUTION_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as InstitutionSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing institution snapshot for undo')
    const row = await authorizeReplay(ctx, INSTITUTION_RESOURCE_KIND, before.id, loader(ctx))
    await undoRestore(ctx, row, before, restoreInstitution, institutionEvents, 'updated')
  },
}

const deleteInstitutionCommand: CommandHandler<Record<string, unknown>, InstitutionCommandResult> = {
  id: 'club_core.institutions.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.institutions.delete', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(institutionDeleteSchema, INSTITUTION_RESOURCE_KIND, loader(ctx)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Institution
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      // The same lock as the place writes that name an owner, so a place cannot take this owner meanwhile.
      await lockPlaceHierarchy(em, row.organizationId)
      if ((await countPlacesOwnedBy(em, scope, row.id)) > 0) await clubCoreErrors.throw('institution_in_use')
      const before = institutionSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'deleted', institutionEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: INSTITUTION_RESOURCE_KIND,
      labelKey: 'club_core.audit.institutions.delete',
      fallback: 'Delete an institution',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, INSTITUTION_RESOURCE_KIND, logEntry.resourceId, loader(ctx, true))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as InstitutionSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing institution snapshot for undo')
    const row = await authorizeReplay(ctx, INSTITUTION_RESOURCE_KIND, before.id, loader(ctx, true))
    await undoRestore(ctx, row, before, restoreInstitution, institutionEvents, 'created')
  },
}

registerCommand(createInstitutionCommand)
registerCommand(updateInstitutionCommand)
registerCommand(deleteInstitutionCommand)
