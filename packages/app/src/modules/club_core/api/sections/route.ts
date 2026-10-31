// `/api/club_core/sections` — the club's sections (club spec API table, TEST-001, TEST-032): the list is filtered by
// the record scope (the club administrator sees every section, a coordinator the sections they coordinate) and is
// open to response enrichers (`people` adds the coordinators); create, update and delete run the `club_core` commands.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Section } from '../../data/entities'
import {
  sectionCreateSchema,
  sectionDeleteSchema,
  sectionListQuerySchema,
  sectionUpdateSchema,
} from '../../data/validators'
import {
  SECTION_COLUMNS,
  SECTION_ENTITY_ID,
  SECTION_READ_KINDS,
  sectionListItem,
  sectionListItemSchema,
  updateResponseSchema,
} from '../shared'

type SectionListQuery = z.infer<typeof sectionListQuerySchema>

const rawBodySchema = z.object({}).loose()

type CommandResult = { entity: Section }

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['club_core.view'] },
    POST: { requireAuth: true, requireFeatures: ['club_core.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['club_core.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['club_core.manage'] },
  },
  orm: {
    entity: Section,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  enrichers: { entityId: SECTION_ENTITY_ID },
  list: {
    schema: sectionListQuerySchema,
    entityId: SECTION_ENTITY_ID,
    fields: [
      'id',
      'name',
      'description',
      'is_active',
      'logo_attachment_id',
      'is_public',
      'public_slug',
      'public_description',
      'public_conditions',
      'public_contact_name',
      'public_contact_email',
      'public_contact_phone',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { name: 'name', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: SectionListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.isActive) business.is_active = query.isActive === 'true'
      return { $and: [scopeWhere(scope, SECTION_READ_KINDS, SECTION_COLUMNS), business] } as Where
    },
    transformItem: sectionListItem,
  },
  actions: {
    create: {
      commandId: 'club_core.sections.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as CommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'club_core.sections.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as CommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
    delete: {
      commandId: 'club_core.sections.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Club core' })

export const openApi = buildOpenApi({
  resourceName: 'Section',
  pluralName: 'Sections',
  querySchema: sectionListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(sectionListItemSchema),
  create: {
    schema: sectionCreateSchema,
    description: 'Creates a section (club administrator). Errors: 400 invalid input, 403 `scope_denied`.',
  },
  update: {
    schema: sectionUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes a section; send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
  del: {
    schema: sectionDeleteSchema,
    description:
      'Soft-deletes a section (`?id=`); send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
