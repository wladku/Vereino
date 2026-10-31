// `/api/groups/memberships` — group rosters with their history (club spec API table, glossary *Membership*; #30
// criteria 1–2): the list holds the memberships of the groups the caller may read (the coach's groups, the groups of
// the coordinator's sections, every group for the club administrator — `scopeWhere` on the groups) with the person's
// name; create and update run the `groups` commands (overlap → 409). A membership is ended through
// `POST /api/groups/memberships/{id}/end`, never deleted.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeContract, trustedScopeOf } from '@/modules/foundation'
import type { MembershipCommandResult } from '../../commands/memberships'
import { GroupMembership } from '../../data/entities'
import { membershipCreateSchema, membershipListQuerySchema, membershipUpdateSchema } from '../../data/validators'
import { personNames, readableGroupIds } from '../../services/groups-read'
import {
  GROUP_ENTITY_COLUMNS,
  GROUP_READ_KINDS,
  MEMBERSHIP_ENTITY_ID,
  membershipListItem,
  membershipListItemSchema,
  updateResponseSchema,
  type MembershipListItem,
} from '../shared'

type MembershipListQuery = z.infer<typeof membershipListQuerySchema>

const rawBodySchema = z.object({}).loose()

/** Matches no row (`id IS NULL`; the primary key is never null), like `scopeWhere`'s fail-closed fragment. */
const NO_ROWS: Where = { id: { $exists: false } } as Where

/** Adds the person's name to the roster rows the scope filter already admitted. */
async function attachPersons(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as MembershipListItem[]
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (items.length === 0 || !tenantId || !organizationId) return
  const personIds = items.map((item) => item.personId).filter((id): id is string => Boolean(id))
  const names = await personNames(ctx.container, { tenantId, organizationId }, personIds)
  for (const item of items) item.person = item.personId ? (names.get(item.personId) ?? null) : null
}

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['groups.view'] },
    POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['groups.manage'] },
  },
  orm: {
    entity: GroupMembership,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: membershipListQuerySchema,
    entityId: MEMBERSHIP_ENTITY_ID,
    fields: [
      'id',
      'group_id',
      'person_id',
      'role',
      'valid_from',
      'valid_to',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { validFrom: 'valid_from', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: MembershipListQuery, ctx: CrudCtx): Promise<Where> => {
      const trusted = trustedScopeOf(ctx)
      if (!trusted) return NO_ROWS
      const scope = await scopeContract.resolve(ctx)
      const groupIds = await readableGroupIds(ctx.container, trusted, scope, GROUP_READ_KINDS, GROUP_ENTITY_COLUMNS)
      const scoped: Where = groupIds === 'all' ? {} : groupIds.length > 0 ? { group_id: { $in: groupIds } } : NO_ROWS
      const business: Where = {}
      if (query.groupId) business.group_id = query.groupId
      if (query.personId) business.person_id = query.personId
      if (query.role) business.role = query.role
      const conditions: Where[] = [scoped, business]
      if (query.activeOn) {
        conditions.push({
          valid_from: { $lte: query.activeOn },
          $or: [{ valid_to: { $exists: false } }, { valid_to: { $gte: query.activeOn } }],
        } as Where)
      }
      return { $and: conditions } as Where
    },
    transformItem: membershipListItem,
  },
  hooks: {
    afterList: attachPersons,
  },
  actions: {
    create: {
      commandId: 'groups.memberships.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as MembershipCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'groups.memberships.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole } = result as MembershipCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), actingRole }
      },
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Groups' })

export const openApi = buildOpenApi({
  resourceName: 'Membership',
  pluralName: 'Memberships',
  querySchema: membershipListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(membershipListItemSchema),
  create: {
    schema: membershipCreateSchema,
    description:
      'Adds a person to a group as `participant`, `coach` or `assistant` for a period (a coordinator in the groups of their sections, the club administrator anywhere). Errors: 400 invalid input, 403 `scope_denied`, 404 unknown group, 409 `membership_overlap`, 422 `groups_reference_invalid`, `validity_inverted`.',
  },
  update: {
    schema: membershipUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes the role or the period of a membership; send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `membership_overlap`, 422 `validity_inverted`.',
  },
})
