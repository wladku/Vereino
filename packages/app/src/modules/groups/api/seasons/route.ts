// `/api/groups/seasons` — the club-wide season dictionary of `team` groups (club spec API table, REQ-019): read by a
// coach, a coordinator and the club administrator (club-wide through `scopeWhere` with `clubWideKinds`), written by the
// club administrator and the coordinators through the `groups` commands (a duplicate name → 409, a season used by a
// group → 409 on delete).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { SeasonCommandResult } from '../../commands/seasons'
import { Season } from '../../data/entities'
import {
  seasonCreateSchema,
  seasonDeleteSchema,
  seasonListQuerySchema,
  seasonUpdateSchema,
} from '../../data/validators'
import {
  DICTIONARY_COLUMNS,
  DICTIONARY_READ_KINDS,
  DICTIONARY_READ_OPTIONS,
  SEASON_ENTITY_ID,
  seasonListItem,
  seasonListItemSchema,
  updateResponseSchema,
} from '../shared'

type SeasonListQuery = z.infer<typeof seasonListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['groups.view'] },
    POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['groups.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['groups.manage'] },
  },
  orm: {
    entity: Season,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: seasonListQuerySchema,
    entityId: SEASON_ENTITY_ID,
    fields: ['id', 'name', 'starts_on', 'ends_on', 'tenant_id', 'organization_id', 'created_at', 'updated_at'],
    sortFieldMap: { name: 'name', startsOn: 'starts_on', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: SeasonListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      return {
        $and: [scopeWhere(scope, DICTIONARY_READ_KINDS, DICTIONARY_COLUMNS, DICTIONARY_READ_OPTIONS), business],
      } as Where
    },
    transformItem: seasonListItem,
  },
  actions: {
    create: {
      commandId: 'groups.seasons.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as SeasonCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'groups.seasons.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole } = result as SeasonCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), actingRole }
      },
    },
    delete: {
      commandId: 'groups.seasons.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Groups' })

export const openApi = buildOpenApi({
  resourceName: 'Season',
  pluralName: 'Seasons',
  querySchema: seasonListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(seasonListItemSchema),
  create: {
    schema: seasonCreateSchema,
    description:
      'Creates a season (club administrator or a coordinator). Errors: 400 invalid input, 403 `scope_denied`, 409 `season_name_taken`, 422 `season_dates_inverted`.',
  },
  update: {
    schema: seasonUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes a season; send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `season_name_taken`, 422 `season_dates_inverted`.',
  },
  del: {
    schema: seasonDeleteSchema,
    description:
      'Soft-deletes a season (`?id=`); send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `season_in_use`.',
  },
})
