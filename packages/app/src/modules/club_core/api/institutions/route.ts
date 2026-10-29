// `/api/club_core/institutions` — institutions the club works with (club spec API table, TEST-001): the list is the
// club administrator's, with contact, bank account and notes decrypted by the query engine; create, update and
// delete run the `club_core` commands (an institution that owns a place → 409 on delete).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Institution } from '../../data/entities'
import {
  institutionCreateSchema,
  institutionDeleteSchema,
  institutionListQuerySchema,
  institutionUpdateSchema,
} from '../../data/validators'
import {
  INSTITUTION_LIST_ENTITY_ID,
  STRUCTURE_COLUMNS,
  STRUCTURE_READ_KINDS,
  institutionListItem,
  institutionListItemSchema,
  updateResponseSchema,
} from '../shared'

type InstitutionListQuery = z.infer<typeof institutionListQuerySchema>

const rawBodySchema = z.object({}).loose()

type CommandResult = { entity: Institution }

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['club_core.view'] },
    POST: { requireAuth: true, requireFeatures: ['club_core.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['club_core.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['club_core.manage'] },
  },
  orm: {
    entity: Institution,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: institutionListQuerySchema,
    entityId: INSTITUTION_LIST_ENTITY_ID,
    fields: [
      'id',
      'name',
      'type',
      'address',
      'contact_name',
      'contact_phone',
      'contact_email',
      'bank_account',
      'notes',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { name: 'name', type: 'type', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: InstitutionListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.type) business.type = query.type
      return { $and: [scopeWhere(scope, STRUCTURE_READ_KINDS, STRUCTURE_COLUMNS), business] } as Where
    },
    transformItem: institutionListItem,
  },
  actions: {
    create: {
      commandId: 'club_core.institutions.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as CommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'club_core.institutions.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as CommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
    delete: {
      commandId: 'club_core.institutions.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Club core' })

export const openApi = buildOpenApi({
  resourceName: 'Institution',
  pluralName: 'Institutions',
  querySchema: institutionListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(institutionListItemSchema),
  create: {
    schema: institutionCreateSchema,
    description: 'Creates an institution (club administrator). Errors: 400 invalid input, 403 `scope_denied`.',
  },
  update: {
    schema: institutionUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes an institution; send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
  del: {
    schema: institutionDeleteSchema,
    description:
      'Soft-deletes an institution (`?id=`); send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `institution_in_use`.',
  },
})
