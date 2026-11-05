// `/api/people/persons` — list (record scope through `scopeWhere`; a coordinator lists the club's people club-wide,
// basic data only), create and update through the `people` commands. The list never carries the e-mail, phone,
// notes or PESEL.
//
// The list's filters and perspectives (UX parity spec REQ-U01, B-09): `view`, `search` (first or last name),
// `sectionId`, `groupId`, `role`, `hasAccount`, `ageFrom`/`ageTo`. Predicates over `people`'s own data are resolved
// here, membership predicates through the optional `groups.personFilter` contract (DD-U01); the resulting ids are ANDed
// with the record scope, so a filter never widens it. `afterList` adds the own columns `roles`, `hasWards` and
// `guardians` (the list hook is synchronous per row, so the batch read runs after the page); the route opts in to
// response enrichers, so `groups` adds `_groups` (DD-U02).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { ageOn, findActingRole, scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Person } from '../../data/entities'
import { personCreateSchema, personListQuerySchema, personUpdateSchema } from '../../data/validators'
import { PERSON_ENTITY_ID } from '../../encryption'
import { PERSON_FILTER_ID_LIMIT, intersectIdSets, personListPlan } from '../../lib/person-list-filters'
import { clubToday, type ClubScope } from '../../services/club-clock'
import {
  PersonFilterProblem,
  loadPersonListColumns,
  resolvePlanPersonIds,
  searchPersonIds,
  type PersonListColumns,
} from '../../services/person-list'
import { peopleErrors } from '../errors'
import { PEOPLE_READ_OPTIONS, PERSON_COLUMNS, PERSON_READ_KINDS, personListItem } from '../shared'

type PersonListQuery = z.infer<typeof personListQuerySchema>

const rawBodySchema = z.object({}).loose()

/** An id no person has: the `id` filter of a predicate that matched nobody. */
const NO_PERSON_ID = '00000000-0000-0000-0000-000000000000'

function clubScopeOf(ctx: CrudCtx): ClubScope | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  return tenantId && organizationId ? { tenantId, organizationId } : null
}

/** The filter and perspective predicates of the query, ANDed with the record scope by `buildFilters`. */
async function filterPredicates(query: PersonListQuery, ctx: CrudCtx, clubScope: ClubScope): Promise<Where[]> {
  const predicates: Where[] = []
  const today = await clubToday(ctx.container, clubScope)
  if (query.ageFrom !== undefined && query.ageTo !== undefined && query.ageFrom > query.ageTo) {
    return peopleErrors.throw('people_filter_age_range', { field: 'ageTo' })
  }
  const plan = personListPlan(query, today)
  for (const exists of plan.accountConditions) predicates.push({ user_id: { $exists: exists } } as Where)
  // `birth_date` is a plain `date` column; the bounds are calendar dates in the club zone.
  if (plan.birthDates?.onOrBefore) predicates.push({ birth_date: { $lte: plan.birthDates.onOrBefore } } as Where)
  if (plan.birthDates?.after) predicates.push({ birth_date: { $gt: plan.birthDates.after } } as Where)
  let ids: Set<string> | null
  try {
    ids = await resolvePlanPersonIds(ctx.container, clubScope, plan, today)
  } catch (error) {
    if (!(error instanceof PersonFilterProblem)) throw error
    if (error.problem === 'unavailable') return peopleErrors.throw('people_filter_unavailable')
    return peopleErrors.throw('people_filter_failed')
  }
  if (query.search) {
    const found = await searchPersonIds(ctx.container, clubScope, query.search)
    // The token index was not consulted (no word of three characters or more): match the last name as before.
    if (found) ids = intersectIdSets([ids, found])
    else predicates.push({ last_name: { $ilike: `%${escapeLikePattern(query.search)}%` } } as Where)
  }
  if (ids) {
    if (ids.size > PERSON_FILTER_ID_LIMIT) return peopleErrors.throw('people_filter_too_broad')
    predicates.push({ id: { $in: ids.size > 0 ? [...ids] : [NO_PERSON_ID] } } as Where)
  }
  return predicates
}

/** Adds the own columns (`roles`, `hasWards`, `guardians`) to the listed rows; a guardian is named only when readable. */
async function attachOwnColumns(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as Array<
    { id: string; birthDate?: string | null; age?: number | null } & Partial<PersonListColumns>
  >
  const clubScope = clubScopeOf(ctx)
  if (items.length === 0 || !clubScope) return
  const scope = await scopeContract.resolve(ctx)
  const today = await clubToday(ctx.container, clubScope)
  const canReadPerson = (personId: string) =>
    findActingRole(scope, PERSON_READ_KINDS, { id: personId, ...clubScope, personId }, PEOPLE_READ_OPTIONS) !== null
  const columns = await loadPersonListColumns(
    ctx.container,
    clubScope,
    items.map((item) => item.id),
    today,
    canReadPerson,
  )
  for (const item of items) {
    const own = columns.get(item.id)
    // The age in completed years on the club's date (the list shows the age, not the birth date).
    item.age = item.birthDate ? ageOn(item.birthDate.slice(0, 10), today) : null
    item.roles = own?.roles ?? []
    item.hasWards = own?.hasWards ?? false
    item.guardians = own?.guardians ?? []
  }
}

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
  enrichers: { entityId: PERSON_ENTITY_ID },
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
      const business: Where[] = []
      // `last_name` is encrypted: the query engine answers this through `search_tokens`.
      if (query.lastName) business.push({ last_name: { $ilike: `%${escapeLikePattern(query.lastName)}%` } } as Where)
      const clubScope = clubScopeOf(ctx)
      if (clubScope) business.push(...(await filterPredicates(query, ctx, clubScope)))
      else business.push({ id: NO_PERSON_ID } as Where)
      return {
        $and: [scopeWhere(scope, PERSON_READ_KINDS, PERSON_COLUMNS, PEOPLE_READ_OPTIONS), ...business],
      } as Where
    },
    transformItem: personListItem,
  },
  hooks: {
    afterList: attachOwnColumns,
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
  age: z.number().int().nullable().describe('Completed years on the club date; null without a birth date'),
  roles: z.array(z.enum(['club_admin', 'coordinator', 'coach'])).describe('Active role assignments today'),
  hasWards: z.boolean().describe('The person is an active guardian today'),
  guardians: z
    .array(z.object({ id: z.uuid(), displayName: z.string() }))
    .describe('Active guardians the caller may read, as "Last First"'),
  _groups: z
    .object({ groups: z.array(z.object({ id: z.uuid(), name: z.string(), role: z.string() })) })
    .optional()
    .describe('Active group memberships today; added by the groups module when it is enabled'),
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
