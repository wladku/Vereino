// `/api/groups/memberships` — group rosters with their history (club spec API table, glossary *Membership*; #30
// criteria 1–2): the list holds the memberships of the groups the caller may read (the coach's groups, the groups of
// the coordinator's sections, every group for the club administrator — `scopeWhere` on the groups) with the person's
// name and age (E06-S08 #90) and the group's name, kind and section (#84, the person record's Groups tab); create and
// update run the `groups` commands (overlap → 409). A membership is ended through
// `POST /api/groups/memberships/{id}/end`; only a mistake is removed (`DELETE ?id=`, parity spec REQ-A03, #267: one
// that has not started or was never used, else 409 `membership_in_use`). `status` narrows the list to a roster view on
// the club's today; `sortField=roster` orders coaches, assistants, then participants, the latest start first.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import type { MembershipCommandResult } from '../../commands/memberships'
import { GroupMembership } from '../../data/entities'
import {
  membershipCreateSchema,
  membershipDeleteSchema,
  membershipListQuerySchema,
  membershipUpdateSchema,
} from '../../data/validators'
import { rosterViewBounds } from '../../lib/groups-rules'
import { clubToday } from '../../services/club-clock'
import { groupSummaries, readableGroupIds, rosterPersons } from '../../services/groups-read'
import { rosterPage } from '../../services/roster-list'
import {
  GROUP_ENTITY_COLUMNS,
  GROUP_READ_KINDS,
  MEMBERSHIP_ENTITY_ID,
  membershipListItemSchema,
  membershipListItem,
  membershipView,
  updateResponseSchema,
  type MembershipListItem,
} from '../shared'

type MembershipListQuery = z.infer<typeof membershipListQuerySchema>

const rawBodySchema = z.object({}).loose()

/** Matches no row (`id IS NULL`; the primary key is never null), like `scopeWhere`'s fail-closed fragment. */
const NO_ROWS: Where = { id: { $exists: false } } as Where

/**
 * Adds the person's name and age on the club day (E06-S08 #90) and the group summary (#84) to the roster rows the
 * scope filter already admitted.
 */
async function attachPersons(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (!tenantId || !organizationId) return
  await attachPersonsInScope((payload.items ?? []) as MembershipListItem[], ctx.container, { tenantId, organizationId })
}

async function attachPersonsInScope(
  items: MembershipListItem[],
  container: CrudCtx['container'],
  scope: { tenantId: string; organizationId: string },
): Promise<void> {
  if (items.length === 0) return
  const personIds = items.map((item) => item.personId).filter((id): id is string => Boolean(id))
  const groupIds = items.map((item) => item.groupId).filter((id): id is string => Boolean(id))
  const [persons, groups] = await Promise.all([
    clubToday(container, scope).then((today) => rosterPersons(container, scope, personIds, today)),
    groupSummaries(container, scope, groupIds),
  ])
  for (const item of items) {
    item.person = item.personId ? (persons.get(item.personId) ?? null) : null
    item.group = item.groupId ? (groups.get(item.groupId) ?? null) : null
  }
}

/** The roster view of `status` on the club's today, as a query-engine condition (REQ-A03). */
async function statusCondition(query: MembershipListQuery, ctx: CrudCtx): Promise<Where | null> {
  if (!query.status) return null
  const trusted = trustedScopeOf(ctx)
  if (!trusted) return NO_ROWS
  const bounds = rosterViewBounds(query.status, await clubToday(ctx.container, trusted))
  if (bounds.view === 'active') {
    return {
      valid_from: { $lte: bounds.startsOnOrBefore },
      $or: [{ valid_to: { $exists: false } }, { valid_to: { $gte: bounds.endsOnOrAfter } }],
    } as Where
  }
  if (bounds.view === 'upcoming') return { valid_from: { $gt: bounds.startsAfter } } as Where
  return { valid_to: { $lt: bounds.endsBefore } } as Where
}

const crud = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['groups.view'] },
    POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['groups.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['groups.manage'] },
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
      const status = await statusCondition(query, ctx)
      if (status) conditions.push(status)
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
    delete: {
      commandId: 'groups.memberships.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

export const { metadata, POST, PUT, DELETE } = crud

/**
 * `sortField=roster` (REQ-A03): the roster order (role, then the latest start) is not a single column, so the page is
 * read by `rosterPage` under the same record scope as the CRUD list; every other sort runs the CRUD list. The order is
 * fixed, so `sortDir` and `ids` have no effect here (documented in `openApi`, #359).
 */
async function rosterList(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const trusted = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !trusted) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = membershipListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const scope = await scopeContract.resolve(ctx)
    const groupIds = await readableGroupIds(ctx.container, trusted, scope, GROUP_READ_KINDS, GROUP_ENTITY_COLUMNS)
    const today = await clubToday(ctx.container, trusted)
    const { rows, total } = await rosterPage(
      ctx.container,
      trusted,
      { ...query, groupIds, today },
      query.page,
      query.pageSize,
    )
    const items: MembershipListItem[] = rows.map(membershipView)
    await attachPersonsInScope(items, ctx.container, trusted)
    return Response.json({
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.memberships.list')
  }
}

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get('sortField') === 'roster') return rosterList(request)
  return crud.GET(request)
}

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Groups' })

export const openApi = buildOpenApi({
  resourceName: 'Membership',
  pluralName: 'Memberships',
  description:
    "Returns a paginated list of the memberships in the groups the caller may read (a coach's groups, the groups of a coordinator's sections, every group for the club administrator), with the person and the group. `status` narrows it to a roster view on the club's today. `sortField=roster` orders coaches, assistants, then participants, the latest start first, then by id; that order is fixed, so on this sort `sortDir` and `ids` are ignored.",
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
  del: {
    schema: membershipDeleteSchema,
    description:
      "Removes a membership entered by mistake (`?id=`; a soft delete, undoable): one that has not started, or a started one with no attendance of the person in the group's sessions within its period. Issued charges stay. Send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `membership_in_use` (end it instead), 409 `membership_overlap` (on undo), 503 `group_usage_failed`.",
  },
})
