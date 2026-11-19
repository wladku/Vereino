// `club_core.places.add_external` (club events spec REQ-T06, DD-T08, Q-T10; #377): a section coordinator — or the
// club administrator — adds a missing venue from a club event form. The place is a root, active, external leaf with a
// name, an address, a kind (default `other`) and an optional owner institution; every other field takes its default
// (not managed or rented by the club, no public calendar, no online requests, no opening hours, capacity 1). A live
// place of the club with the same name and address (trimmed, case-insensitive) answers 409 `external_place_exists`
// with `details.placeId`, so the form offers to pick it; creates of one club are serialized by the place hierarchy's
// advisory lock, so two coordinators cannot add the same hall twice at once. The coordinator acts club-wide
// (`clubWideKinds`, as `/api/club_core/options/places`); editing and deleting the place stay `club_core.manage`.
// The undo removes the place while no activity, session or club event points at it (409 `place_in_use`).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { GrantKind, ScopeMatchOptions } from '@vereino/core'
import { authorizeScoped, type TargetLock } from '@/modules/foundation'
import { z } from 'zod'
import { clubCoreErrors } from '../api/errors'
import { Institution, Place } from '../data/entities'
import { lockPlaceHierarchy } from '../data/queries'
import { placeAddExternalSchema } from '../data/validators'
import { duplicateExternalPlaceId } from '../lib/places'
import { placeUsageContract } from '../services/place-usage'
import { PLACE_RESOURCE_KIND, placeEvents, placeSnapshot, type PlaceCommandResult } from './places'
import {
  decryptionScope,
  emitStructure,
  inWriteTransaction,
  structureLog,
  structureTarget,
  trustedTenantId,
  undoCreate,
} from './shared'

export const ADD_EXTERNAL_PLACE_COMMAND = 'club_core.places.add_external'

/** The section coordinators and the club administrator (least-privileged first). */
export const EXTERNAL_PLACE_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']

/** A coordinator adds a place for the whole club, whatever their sections (DD-T08). */
export const EXTERNAL_PLACE_MATCH: ScopeMatchOptions = { clubWideKinds: ['coordinator'] }

type Scope = { tenantId: string; organizationId: string }

/** 409 `external_place_exists` with the id of the live place of the club with the same name and address. */
async function assertNoDuplicate(em: EntityManager, scope: Scope, name: string, address: string): Promise<void> {
  // Narrowed by name in SQL (a contains match survives stored spaces around it); the exact rule is the pure key.
  const candidates = await em.find(
    Place,
    { ...scope, deletedAt: null, name: { $ilike: `%${escapeLikePattern(name)}%` } },
    { fields: ['id', 'name', 'address'], orderBy: { createdAt: 'asc', id: 'asc' } },
  )
  const placeId = duplicateExternalPlaceId(
    { name, address },
    candidates.map((row) => ({ id: row.id, name: row.name, address: row.address ?? null })),
  )
  if (placeId) await clubCoreErrors.throw('external_place_exists', { details: { placeId } })
}

/** The owner must be a live institution of the club (422 `place_reference_invalid` at the field, as on B-06). */
async function assertOwner(em: EntityManager, scope: Scope, institutionId: string | null | undefined) {
  if (!institutionId) return
  const owner = await em.findOne(Institution, { id: institutionId, ...scope, deletedAt: null }, { fields: ['id'] })
  if (!owner) await clubCoreErrors.throw('place_reference_invalid', { field: 'ownerInstitutionId' })
}

function loader(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Place | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return findOneWithDecryption(em, Place, { id, tenantId, deletedAt: null }, lock, decryptionScope(ctx))
  }
}

/** Re-authorizes the undo for the same kinds the command accepts and returns the row-locked place. */
async function authorizeUndo(ctx: CommandRuntimeContext, id: string | null | undefined): Promise<Place> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] replay needs the replay transaction and the id: ' + PLACE_RESOURCE_KIND)
  const load = loader(ctx)
  const { entity } = await authorizeScoped(
    {
      input: z.object({ id: z.uuid() }),
      resourceKind: PLACE_RESOURCE_KIND,
      allowedKinds: EXTERNAL_PLACE_KINDS,
      matchOptions: EXTERNAL_PLACE_MATCH,
      loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
      resolveTarget: (_parsed, row) => structureTarget(row as Place),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Place
}

const addExternalPlaceCommand: CommandHandler<Record<string, unknown>, PlaceCommandResult> = {
  id: ADD_EXTERNAL_PLACE_COMMAND,
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, ADD_EXTERNAL_PLACE_COMMAND, async (em) => {
      const authorized = await authorizeScoped(
        {
          input: placeAddExternalSchema,
          resourceKind: PLACE_RESOURCE_KIND,
          allowedKinds: EXTERNAL_PLACE_KINDS,
          matchOptions: EXTERNAL_PLACE_MATCH,
          resolveTarget: (_parsed, _entity, scope) => structureTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      // One writer of the club's places at a time: the duplicate check and the owner check hold until the commit.
      await lockPlaceHierarchy(em, organizationId)
      await assertNoDuplicate(em, scope, parsed.name, parsed.address)
      await assertOwner(em, scope, parsed.ownerInstitutionId)
      const row = em.create(Place, {
        id,
        tenantId,
        organizationId,
        parentPlaceId: null,
        kind: parsed.kind,
        name: parsed.name,
        surface: null,
        address: parsed.address,
        geoLat: null,
        geoLng: null,
        description: null,
        ownerInstitutionId: parsed.ownerInstitutionId ?? null,
        managedByClub: false,
        isExternal: true,
        rentedByClub: false,
        capacityGroups: 1,
        contacts: null,
        openingHours: null,
        isActive: true,
        regulationsText: null,
        publicSlug: null,
        isPublicSchedule: false,
        acceptsOnlineRequests: false,
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
      labelKey: 'club_core.audit.places.add_external',
      fallback: 'Add an external place',
      after: placeSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeUndo(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeUndo(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm
    const contract = placeUsageContract(ctx.container)
    if (em && contract) {
      const used = await contract.isPlaceUsed(em, {
        tenantId: row.tenantId,
        organizationId: row.organizationId,
        placeId: row.id,
      })
      if (used) await clubCoreErrors.throw('place_in_use')
    }
    await undoCreate(ctx, row, placeEvents)
  },
}

registerCommand(addExternalPlaceCommand)
