// `/api/facilities/closures` — closures of the club's places (facilities spec glossary *Closure*, DD-22, the CRUD row
// of *API, Command, and Error Contracts*; REQ-013; #121): read with `facilities.view` by the club administrator,
// written with `facilities.manage` through the `facilities.closures.*` commands. A create or a moved closure answers
// with `flagged`: the planned sessions (and, from E08-S02 on, rentals) it marked to be moved.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { ClosureCommandResult } from '../../commands/closures'
import { READ_KINDS } from '../../commands/shared'
import { Closure } from '../../data/entities'
import {
  closureCreateSchema,
  closureDeleteSchema,
  closureListQuerySchema,
  closureUpdateSchema,
} from '../../data/validators'
import {
  CLOSURE_ENTITY_ID,
  FACILITY_COLUMNS,
  closureListItem,
  closureListItemSchema,
  rescheduleCountsSchema,
  updateResponseSchema,
} from '../shared'

type ClosureListQuery = z.infer<typeof closureListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.view'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['facilities.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['facilities.manage'] },
  },
  orm: {
    entity: Closure,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: closureListQuerySchema,
    entityId: CLOSURE_ENTITY_ID,
    fields: [
      'id',
      'place_id',
      'starts_at',
      'ends_at',
      'reason',
      'note',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { startsAt: 'starts_at', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: ClosureListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.reason) business.push({ reason: query.reason })
      if (query.endsAfter) business.push({ ends_at: { $gte: query.endsAfter } })
      return { $and: [scopeWhere(scope, READ_KINDS, FACILITY_COLUMNS), ...business] } as Where
    },
    transformItem: closureListItem,
  },
  actions: {
    create: {
      commandId: 'facilities.closures.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, flagged } = result as ClosureCommandResult
        return { id: entity.id, flagged }
      },
      status: 201,
    },
    update: {
      commandId: 'facilities.closures.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, flagged } = result as ClosureCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), flagged }
      },
    },
    delete: {
      commandId: 'facilities.closures.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'Closure',
  pluralName: 'Closures',
  querySchema: closureListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(closureListItemSchema),
  create: {
    schema: closureCreateSchema,
    responseSchema: z.object({ id: z.uuid(), flagged: rescheduleCountsSchema }),
    description:
      'Creates a closure of a place (club administrator) and marks the planned sessions on the place and its sub-places in that time to be moved (`flagged`). Errors: 400 invalid input, 403 `scope_denied`, 422 `closure_period_invalid`, 422 `facilities_reference_invalid` (unknown place).',
  },
  update: {
    schema: closureUpdateSchema,
    responseSchema: updateResponseSchema.extend({ flagged: rescheduleCountsSchema }),
    description:
      'Changes a closure; a moved period or place marks the sessions in the new time (`flagged`). Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 422 `closure_period_invalid`.',
  },
  del: {
    schema: closureDeleteSchema,
    description:
      'Soft-deletes a closure (`?id=`); flags already set stay for the coordinator to resolve. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
