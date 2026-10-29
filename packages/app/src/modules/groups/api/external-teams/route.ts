// `/api/groups/external-teams` — the club-wide dictionary of opponents and tournament guests (club spec API table,
// REQ-020): read by a coach, a coordinator and the club administrator (club-wide through `scopeWhere` with
// `clubWideKinds`), with the contact decrypted by the query engine; written by the club administrator and the
// coordinators through the `groups` commands.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { ExternalTeamCommandResult } from '../../commands/external-teams'
import { ExternalTeam } from '../../data/entities'
import {
  externalTeamCreateSchema,
  externalTeamDeleteSchema,
  externalTeamListQuerySchema,
  externalTeamUpdateSchema,
} from '../../data/validators'
import {
  DICTIONARY_COLUMNS,
  DICTIONARY_READ_KINDS,
  DICTIONARY_READ_OPTIONS,
  EXTERNAL_TEAM_LIST_ENTITY_ID,
  externalTeamListItem,
  externalTeamListItemSchema,
  updateResponseSchema,
} from '../shared'

type ExternalTeamListQuery = z.infer<typeof externalTeamListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['groups.view'] },
    POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['groups.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['groups.manage'] },
  },
  orm: {
    entity: ExternalTeam,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: externalTeamListQuerySchema,
    entityId: EXTERNAL_TEAM_LIST_ENTITY_ID,
    fields: [
      'id',
      'name',
      'club_name',
      'institution_id',
      'contact',
      'notes',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { name: 'name', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: ExternalTeamListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      return {
        $and: [scopeWhere(scope, DICTIONARY_READ_KINDS, DICTIONARY_COLUMNS, DICTIONARY_READ_OPTIONS), business],
      } as Where
    },
    transformItem: externalTeamListItem,
  },
  actions: {
    create: {
      commandId: 'groups.external_teams.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as ExternalTeamCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'groups.external_teams.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole } = result as ExternalTeamCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), actingRole }
      },
    },
    delete: {
      commandId: 'groups.external_teams.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Groups' })

export const openApi = buildOpenApi({
  resourceName: 'External team',
  pluralName: 'External teams',
  querySchema: externalTeamListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(externalTeamListItemSchema),
  create: {
    schema: externalTeamCreateSchema,
    description:
      'Creates an external team (club administrator or a coordinator); the contact is stored encrypted. Errors: 400 invalid input, 403 `scope_denied`, 422 `groups_reference_invalid` (unknown institution).',
  },
  update: {
    schema: externalTeamUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes an external team; send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 422 `groups_reference_invalid`.',
  },
  del: {
    schema: externalTeamDeleteSchema,
    description:
      'Soft-deletes an external team (`?id=`); send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
