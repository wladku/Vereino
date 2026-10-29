// `/api/people/guardianships` — guardianships (club spec API table; #26): the list filtered by the record scope (the
// ward, a guardian of the ward, the club administrator, and a coordinator club-wide without the consents), create
// and update through the `people` commands. The consents are never part of the query-engine projection: `afterList`
// adds them only for the rows `consentsVisible` allows (fail closed — without the hook nothing is returned).
import { z } from 'zod'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { findActingRole, scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { GuardianshipCommandResult } from '../../commands/guardianships'
import { Guardianship } from '../../data/entities'
import { guardianshipCreateSchema, guardianshipListQuerySchema, guardianshipUpdateSchema } from '../../data/validators'
import { findGuardianshipConsents } from '../../services/people-read'
import {
  GUARDIANSHIP_COLUMNS,
  GUARDIANSHIP_READ_KINDS,
  PEOPLE_READ_OPTIONS,
  consentsVisible,
  guardianshipListItem,
  guardianshipViewSchema,
  type GuardianshipView,
} from '../shared'

type GuardianshipListQuery = z.infer<typeof guardianshipListQuerySchema>

const rawBodySchema = z.object({}).loose()

/** Adds the consents to the list rows the caller may see them on (the club administrator, a guardian of the ward). */
async function attachVisibleConsents(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as GuardianshipView[]
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (items.length === 0 || !ctx.auth?.sub || !tenantId || !organizationId) return
  const scope = await scopeContract.resolve(ctx)
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  const canManage = await rbac.userHasAllFeatures(ctx.auth.sub, ['people.manage'], { tenantId, organizationId })
  const visibleIds = items
    .filter((item) => {
      const target = { id: item.id, tenantId, organizationId, personId: item.wardPersonId }
      const actingRole = findActingRole(scope, GUARDIANSHIP_READ_KINDS, target, PEOPLE_READ_OPTIONS)
      return actingRole !== null && consentsVisible(actingRole, canManage)
    })
    .map((item) => item.id)
  const consentsById = await findGuardianshipConsents(ctx.container, { tenantId, organizationId }, visibleIds)
  for (const item of items) {
    const consents = consentsById.get(item.id)
    if (consents) item.consents = consents
  }
}

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['people.view'] },
    POST: { requireAuth: true, requireFeatures: ['people.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['people.manage'] },
  },
  orm: {
    entity: Guardianship,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: guardianshipListQuerySchema,
    entityId: 'people:guardianship',
    // `consents` is deliberately not projected (see `attachVisibleConsents`).
    fields: [
      'id',
      'guardian_person_id',
      'ward_person_id',
      'relation',
      'is_primary_payer',
      'valid_from',
      'valid_to',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { createdAt: 'created_at', updatedAt: 'updated_at', validFrom: 'valid_from' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: GuardianshipListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.personId) {
        business.push({ $or: [{ guardian_person_id: query.personId }, { ward_person_id: query.personId }] } as Where)
      }
      if (query.guardianPersonId) business.push({ guardian_person_id: query.guardianPersonId } as Where)
      if (query.wardPersonId) business.push({ ward_person_id: query.wardPersonId } as Where)
      const scoped = scopeWhere(scope, GUARDIANSHIP_READ_KINDS, GUARDIANSHIP_COLUMNS, PEOPLE_READ_OPTIONS)
      return { $and: [scoped, ...business] } as Where
    },
    transformItem: guardianshipListItem,
  },
  hooks: {
    afterList: attachVisibleConsents,
  },
  actions: {
    create: {
      commandId: 'people.guardianships.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as GuardianshipCommandResult).guardianship.id }),
      status: 201,
    },
    update: {
      commandId: 'people.guardianships.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { guardianship, actingRole } = result as GuardianshipCommandResult
        return { ok: true, id: guardianship.id, updatedAt: guardianship.updatedAt.toISOString(), actingRole }
      },
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'People' })

export const openApi = buildOpenApi({
  resourceName: 'Guardianship',
  pluralName: 'Guardianships',
  querySchema: guardianshipListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(guardianshipViewSchema),
  create: {
    schema: guardianshipCreateSchema,
    description:
      'Links a guardian and a ward for a period with the relation, the primary-payer flag and the consents (club administrator). Errors: 403 `scope_denied`, 404 unknown person, 409 `guardianship_primary_payer_conflict`, 422 `guardianship_self`, `validity_inverted`.',
  },
  update: {
    schema: guardianshipUpdateSchema,
    responseSchema: z.object({ ok: z.literal(true), id: z.uuid(), updatedAt: z.string(), actingRole: z.string() }),
    description:
      'Changes the relation, the primary-payer flag, the consents or the period; send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 409 `optimistic_lock_conflict`, 409 `guardianship_primary_payer_conflict`, 409 `guardianship_ended`, 422 `validity_inverted`.',
  },
})
