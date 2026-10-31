// `/api/people/persons` — list (record scope through `scopeWhere`; a coordinator lists the club's people club-wide,
// basic data only), create and update through the `people` commands. The list never carries the e-mail, phone,
// notes or PESEL.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Person } from '../../data/entities'
import { personCreateSchema, personListQuerySchema, personUpdateSchema } from '../../data/validators'
import { PEOPLE_READ_OPTIONS, PERSON_COLUMNS, PERSON_READ_KINDS, personListItem } from '../shared'

type PersonListQuery = z.infer<typeof personListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['people.view'] },
    POST: { requireAuth: true, requireFeatures: ['people.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['people.manage'] },
  },
  orm: {
    entity: Person,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: 'people:person' },
  list: {
    schema: personListQuerySchema,
    entityId: 'people:person',
    // The PESEL is never listed (it is returned only by the detail route, with `people.pesel.view`).
    fields: [
      'id',
      'first_name',
      'last_name',
      'preferred_locale',
      'birth_date',
      'user_id',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: PersonListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      // `last_name` is encrypted: the query engine answers this through `search_tokens`.
      if (query.lastName) business.last_name = { $ilike: `%${escapeLikePattern(query.lastName)}%` }
      if (query.hasAccount) business.user_id = { $exists: query.hasAccount === 'true' }
      return {
        $and: [scopeWhere(scope, PERSON_READ_KINDS, PERSON_COLUMNS, PEOPLE_READ_OPTIONS), business],
      } as Where
    },
    transformItem: personListItem,
  },
  actions: {
    create: {
      commandId: 'people.persons.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as { person: Person }).person.id }),
      status: 201,
    },
    update: {
      commandId: 'people.persons.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { person, actingRole } = result as { person: Person; actingRole: string }
        return { ok: true, id: person.id, updatedAt: person.updatedAt.toISOString(), actingRole }
      },
    },
  },
})

const listItemSchema = z.object({
  id: z.uuid(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  preferredLocale: z.string().nullable(),
  birthDate: z.string().nullable(),
  userId: z.string().nullable(),
  hasAccount: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'People' })

export const openApi = buildOpenApi({
  resourceName: 'Person',
  pluralName: 'Persons',
  querySchema: personListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(listItemSchema),
  create: {
    schema: personCreateSchema,
    description:
      'Creates a person (club administrator); `email`, `phone`, `notes`, `pesel` and `externalId` (an import identifier, #28) are stored encrypted. Errors: 403 `scope_denied`, 409 `pesel_duplicate`, 409 `external_id_duplicate`, 422 `pesel_invalid`.',
  },
  update: {
    schema: personUpdateSchema,
    responseSchema: z.object({ ok: z.literal(true), id: z.uuid(), updatedAt: z.string(), actingRole: z.string() }),
    description:
      'Updates a person; send the lock token in the platform optimistic-lock header or as `expectedUpdatedAt` (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 409 `optimistic_lock_conflict`, 409 `pesel_duplicate`, 409 `external_id_duplicate`.',
  },
})
