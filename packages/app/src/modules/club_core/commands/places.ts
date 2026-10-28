// `club_core.places.create|update|delete` (club spec glossary *Place*, TEST-001). The club administrator manages the
// place hierarchy: a parent must be a live place of the club and must not be the place itself or one of its
// descendants (422 `place_hierarchy_cycle`); hierarchy writes of one club are serialized by an advisory lock, so two
// concurrent moves cannot close a loop together. A place with live children is not deleted (409
// `place_has_children`). The rule "a place with sessions or bookings is deactivated, not deleted" arrives with
// `activities` and `facilities`.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { authorizeScoped, type TargetLock } from '@/modules/foundation'
import { clubCoreErrors } from '../api/errors'
import { Institution, Place } from '../data/entities'
import { countPlaceChildren, loadPlaceParents, lockPlaceHierarchy } from '../data/queries'
import { placeCreateSchema, placeDeleteSchema, placeUpdateSchema } from '../data/validators'
import {
  decimalOrNull,
  parsePlaceContacts,
  serializePlaceContacts,
  wouldCreateCycle,
  type PlaceContact,
} from '../lib/places'
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

export const PLACE_RESOURCE_KIND = 'club_core.place'

export const placeEvents = structureEvents<Place>('place')

export type PlaceSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  parentPlaceId: string | null
  kind: string
  name: string
  surface: string | null
  address: string | null
  geoLat: number | null
  geoLng: number | null
  description: string | null
  ownerInstitutionId: string | null
  managedByClub: boolean
  isExternal: boolean
  rentedByClub: boolean
  capacityGroups: number
  contacts: PlaceContact[]
  isActive: boolean
}

export type PlaceCommandResult = StructureCommandResult<Place, PlaceSnapshot>

type Scope = { tenantId: string; organizationId: string }

export function placeSnapshot(row: Place): PlaceSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    parentPlaceId: row.parentPlaceId ?? null,
    kind: row.kind,
    name: row.name,
    surface: row.surface ?? null,
    address: row.address ?? null,
    geoLat: decimalOrNull(row.geoLat),
    geoLng: decimalOrNull(row.geoLng),
    description: row.description ?? null,
    ownerInstitutionId: row.ownerInstitutionId ?? null,
    managedByClub: row.managedByClub,
    isExternal: row.isExternal,
    rentedByClub: row.rentedByClub,
    capacityGroups: row.capacityGroups,
    contacts: parsePlaceContacts(row.contacts),
    isActive: row.isActive,
  }
}

const decimalText = (value: number | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toFixed(6)

function restorePlace(row: Place, before: PlaceSnapshot): void {
  row.parentPlaceId = before.parentPlaceId
  row.kind = before.kind
  row.name = before.name
  row.surface = before.surface
  row.address = before.address
  row.geoLat = decimalText(before.geoLat)
  row.geoLng = decimalText(before.geoLng)
  row.description = before.description
  row.ownerInstitutionId = before.ownerInstitutionId
  row.managedByClub = before.managedByClub
  row.isExternal = before.isExternal
  row.rentedByClub = before.rentedByClub
  row.capacityGroups = before.capacityGroups
  row.contacts = serializePlaceContacts(before.contacts)
  row.isActive = before.isActive
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Place | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    const where = { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }
    return findOneWithDecryption(em, Place, where, lock, decryptionScope(ctx))
  }
}

/** The parent must be a live place of the club and must not close a cycle (`placeId` null for a new place). */
async function assertParent(em: EntityManager, scope: Scope, placeId: string | null, parentId: string | null) {
  if (!parentId) return
  const parents = await loadPlaceParents(em, scope)
  if (placeId && wouldCreateCycle(placeId, parentId, parents)) await clubCoreErrors.throw('place_hierarchy_cycle')
  if (!parents.has(parentId)) await clubCoreErrors.throw('place_reference_invalid', { field: 'parentPlaceId' })
}

/** The owner must be a live institution of the club; the lock keeps it from being deleted meanwhile. */
async function assertOwner(em: EntityManager, scope: Scope, institutionId: string | null | undefined) {
  if (!institutionId) return
  await lockPlaceHierarchy(em, scope.organizationId)
  const owner = await em.findOne(Institution, { id: institutionId, ...scope, deletedAt: null }, { fields: ['id'] })
  if (!owner) await clubCoreErrors.throw('place_reference_invalid', { field: 'ownerInstitutionId' })
}

const createPlaceCommand: CommandHandler<Record<string, unknown>, PlaceCommandResult> = {
  id: 'club_core.places.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'club_core.places.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: placeCreateSchema,
          resourceKind: PLACE_RESOURCE_KIND,
          allowedKinds: STRUCTURE_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => structureTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      if (parsed.parentPlaceId) await lockPlaceHierarchy(em, organizationId)
      await assertParent(em, scope, null, parsed.parentPlaceId ?? null)
      await assertOwner(em, scope, parsed.ownerInstitutionId)
      const row = em.create(Place, {
        id,
        tenantId,
        organizationId,
        parentPlaceId: parsed.parentPlaceId ?? null,
        kind: parsed.kind,
        name: parsed.name,
        surface: parsed.surface ?? null,
        address: parsed.address ?? null,
        geoLat: decimalText(parsed.geoLat),
        geoLng: decimalText(parsed.geoLng),
        description: parsed.description ?? null,
        ownerInstitutionId: parsed.ownerInstitutionId ?? null,
        managedByClub: parsed.managedByClub ?? false,
        isExternal: parsed.isExternal ?? false,
        rentedByClub: parsed.rentedByClub ?? false,
        capacityGroups: parsed.capacityGroups ?? 1,
        contacts: serializePlaceContacts(parsed.contacts),
        isActive: parsed.isActive ?? true,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitStructure(ctx, result.entity, 'created', placeEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: PLACE_RESOURCE_KIND,
      labelKey: 'club_core.audit.places.create',
      fallback: 'Create a place',
      after: placeSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, PLACE_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeReplay(ctx, PLACE_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
    await undoCreate(ctx, row, placeEvents)
  },
}

const updatePlaceCommand: CommandHandler<Record<string, unknown>, PlaceCommandResult> = {
  id: 'club_core.places.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.places.update', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(placeUpdateSchema, PLACE_RESOURCE_KIND, loader(ctx)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Place
      const before = placeSnapshot(row)
      const patch = authorized.parsed
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      if (patch.parentPlaceId !== undefined && patch.parentPlaceId !== (row.parentPlaceId ?? null)) {
        await lockPlaceHierarchy(em, row.organizationId)
        await assertParent(em, scope, row.id, patch.parentPlaceId)
        row.parentPlaceId = patch.parentPlaceId
      }
      if (patch.ownerInstitutionId !== undefined) {
        await assertOwner(em, scope, patch.ownerInstitutionId)
        row.ownerInstitutionId = patch.ownerInstitutionId
      }
      if (patch.kind !== undefined) row.kind = patch.kind
      if (patch.name !== undefined) row.name = patch.name
      if (patch.surface !== undefined) row.surface = patch.surface
      if (patch.address !== undefined) row.address = patch.address
      if (patch.geoLat !== undefined) row.geoLat = decimalText(patch.geoLat)
      if (patch.geoLng !== undefined) row.geoLng = decimalText(patch.geoLng)
      if (patch.description !== undefined) row.description = patch.description
      if (patch.managedByClub !== undefined) row.managedByClub = patch.managedByClub
      if (patch.isExternal !== undefined) row.isExternal = patch.isExternal
      if (patch.rentedByClub !== undefined) row.rentedByClub = patch.rentedByClub
      if (patch.capacityGroups !== undefined) row.capacityGroups = patch.capacityGroups
      if (patch.contacts !== undefined) row.contacts = serializePlaceContacts(patch.contacts)
      if (patch.isActive !== undefined) row.isActive = patch.isActive
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'updated', placeEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: PLACE_RESOURCE_KIND,
      labelKey: 'club_core.audit.places.update',
      fallback: 'Change a place',
      after: placeSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, PLACE_RESOURCE_KIND, logEntry.resourceId, loader(ctx))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as PlaceSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing place snapshot for undo')
    const row = await authorizeReplay(ctx, PLACE_RESOURCE_KIND, before.id, loader(ctx))
    const em = ctx.transactionalEm
    if (em && before.parentPlaceId !== (row.parentPlaceId ?? null)) {
      await lockPlaceHierarchy(em, row.organizationId)
      await assertParent(
        em,
        { tenantId: row.tenantId, organizationId: row.organizationId },
        row.id,
        before.parentPlaceId,
      )
    }
    await undoRestore(ctx, row, before, restorePlace, placeEvents, 'updated')
  },
}

const deletePlaceCommand: CommandHandler<Record<string, unknown>, PlaceCommandResult> = {
  id: 'club_core.places.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'club_core.places.delete', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(placeDeleteSchema, PLACE_RESOURCE_KIND, loader(ctx)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Place
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      await lockPlaceHierarchy(em, row.organizationId)
      if ((await countPlaceChildren(em, scope, row.id)) > 0) await clubCoreErrors.throw('place_has_children')
      const before = placeSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitStructure(ctx, result.entity, 'deleted', placeEvents)
    return result
  },
  buildLog: ({ result }) =>
    structureLog({
      result,
      resourceKind: PLACE_RESOURCE_KIND,
      labelKey: 'club_core.audit.places.delete',
      fallback: 'Delete a place',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, PLACE_RESOURCE_KIND, logEntry.resourceId, loader(ctx, true))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as PlaceSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing place snapshot for undo')
    const row = await authorizeReplay(ctx, PLACE_RESOURCE_KIND, before.id, loader(ctx, true))
    const em = ctx.transactionalEm
    if (em && before.parentPlaceId) {
      await lockPlaceHierarchy(em, row.organizationId)
      await assertParent(
        em,
        { tenantId: row.tenantId, organizationId: row.organizationId },
        row.id,
        before.parentPlaceId,
      )
    }
    await undoRestore(ctx, row, before, restorePlace, placeEvents, 'created')
  },
}

registerCommand(createPlaceCommand)
registerCommand(updatePlaceCommand)
registerCommand(deletePlaceCommand)
