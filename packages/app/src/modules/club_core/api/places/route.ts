// `/api/club_core/places` — the place hierarchy (club spec API table, glossary *Place*, TEST-001): the list is the
// club administrator's (places carry no section scope), with the encrypted contacts decrypted by the query engine,
// filtered by kind, parent and active state, and with the names of the owner institution and the parent place added
// (UX parity spec, REQ-U03, E06-S04 #86); create, update and delete run the `club_core` commands (cycle → 422,
// children on delete → 409).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Place } from '../../data/entities'
import { placeListNames } from '../../services/directory'
import { placeCreateSchema, placeDeleteSchema, placeListQuerySchema, placeUpdateSchema } from '../../data/validators'
import {
  PLACE_LIST_ENTITY_ID,
  STRUCTURE_COLUMNS,
  STRUCTURE_READ_KINDS,
  placeListItem,
  placeListItemSchema,
  updateResponseSchema,
  type PlaceListItem,
} from '../shared'

type PlaceListQuery = z.infer<typeof placeListQuerySchema>

const rawBodySchema = z.object({}).loose()

type CommandResult = { entity: Place }

/**
 * Adds the owner institution's name and the parent place's name to the rows the scope filter already admitted (one
 * read each per page; a deleted owner or parent reads as null).
 */
async function attachNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as PlaceListItem[]
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (items.length === 0 || !tenantId || !organizationId) return
  const scope = { tenantId, organizationId }
  const em = ctx.container.resolve<Parameters<typeof placeListNames>[0]>('em').fork()
  const { owners, parents } = await placeListNames(
    em,
    scope,
    items.flatMap((item) => (item.ownerInstitutionId ? [item.ownerInstitutionId] : [])),
    items.flatMap((item) => (item.parentPlaceId ? [item.parentPlaceId] : [])),
  )
  for (const item of items) {
    item.ownerName = item.ownerInstitutionId ? (owners.get(item.ownerInstitutionId) ?? null) : null
    item.parentName = item.parentPlaceId ? (parents.get(item.parentPlaceId) ?? null) : null
  }
}

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['club_core.view'] },
    POST: { requireAuth: true, requireFeatures: ['club_core.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['club_core.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['club_core.manage'] },
  },
  orm: {
    entity: Place,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: placeListQuerySchema,
    entityId: PLACE_LIST_ENTITY_ID,
    fields: [
      'id',
      'parent_place_id',
      'kind',
      'name',
      'surface',
      'address',
      'geo_lat',
      'geo_lng',
      'description',
      'owner_institution_id',
      'managed_by_club',
      'is_external',
      'rented_by_club',
      'capacity_groups',
      'contacts',
      'opening_hours',
      'is_active',
      'regulations_text',
      'public_slug',
      'is_public_schedule',
      'accepts_online_requests',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { name: 'name', kind: 'kind', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: PlaceListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.kind) business.kind = query.kind
      if (query.parentPlaceId) business.parent_place_id = query.parentPlaceId
      if (query.isActive) business.is_active = query.isActive === 'true'
      return { $and: [scopeWhere(scope, STRUCTURE_READ_KINDS, STRUCTURE_COLUMNS), business] } as Where
    },
    transformItem: placeListItem,
  },
  hooks: {
    afterList: attachNames,
  },
  actions: {
    create: {
      commandId: 'club_core.places.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as CommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'club_core.places.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as CommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
    delete: {
      commandId: 'club_core.places.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Club core' })

export const openApi = buildOpenApi({
  resourceName: 'Place',
  pluralName: 'Places',
  querySchema: placeListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(placeListItemSchema),
  create: {
    schema: placeCreateSchema,
    description:
      'Creates a place (club administrator). Errors: 400 invalid input, 403 `scope_denied`, 409 `public_slug_taken`, 422 `place_reference_invalid` (unknown parent or owner), 422 `place_public_slug_required`.',
  },
  update: {
    schema: placeUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes a place; send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `public_slug_taken`, 422 `place_hierarchy_cycle`, 422 `place_reference_invalid`, 422 `place_public_slug_required`.',
  },
  del: {
    schema: placeDeleteSchema,
    description:
      'Soft-deletes a place (`?id=`); send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `place_has_children`.',
  },
})
