// `/api/groups/groups` — groups of both kinds (club spec API table, REQ-004, TEST-030): the list is filtered by the
// record scope (`scopeWhere`: the coach's groups, the coordinator's sections, the club administrator's club) and adds
// the section and season names; create, update and delete run the `groups` commands (a coordinator of another section
// → 403, team fields on a class group → 422, a group with memberships → 409 on delete).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { GroupCommandResult } from '../../commands/groups'
import { Group } from '../../data/entities'
import { groupCreateSchema, groupDeleteSchema, groupListQuerySchema, groupUpdateSchema } from '../../data/validators'
import { sectionNames, seasonNames } from '../../services/groups-read'
import {
  GROUP_ENTITY_ID,
  GROUP_LIST_COLUMNS,
  GROUP_READ_KINDS,
  groupListItem,
  groupListItemSchema,
  updateResponseSchema,
  type GroupListItem,
} from '../shared'

type GroupListQuery = z.infer<typeof groupListQuerySchema>

const rawBodySchema = z.object({}).loose()

/** Adds the section and season names to the rows the scope filter already admitted. */
async function attachNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as GroupListItem[]
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (items.length === 0 || !tenantId || !organizationId) return
  const scope = { tenantId, organizationId }
  const sectionIds = items.map((item) => item.sectionId).filter((id): id is string => Boolean(id))
  const seasonIds = items.map((item) => item.seasonId).filter((id): id is string => Boolean(id))
  const [sections, seasons] = await Promise.all([
    sectionNames(ctx.container, scope, sectionIds),
    seasonNames(ctx.container, scope, seasonIds),
  ])
  for (const item of items) {
    item.sectionName = item.sectionId ? (sections.get(item.sectionId) ?? null) : null
    item.seasonName = item.seasonId ? (seasons.get(item.seasonId) ?? null) : null
  }
}

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['groups.view'] },
    POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['groups.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['groups.manage'] },
  },
  orm: {
    entity: Group,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: groupListQuerySchema,
    entityId: GROUP_ENTITY_ID,
    fields: [
      'id',
      'section_id',
      'name',
      'kind',
      'league',
      'season_id',
      'description',
      'is_active',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { name: 'name', kind: 'kind', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: GroupListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.sectionId) business.section_id = query.sectionId
      if (query.kind) business.kind = query.kind
      if (query.seasonId) business.season_id = query.seasonId
      if (query.isActive) business.is_active = query.isActive === 'true'
      return { $and: [scopeWhere(scope, GROUP_READ_KINDS, GROUP_LIST_COLUMNS), business] } as Where
    },
    transformItem: groupListItem,
  },
  hooks: {
    afterList: attachNames,
  },
  actions: {
    create: {
      commandId: 'groups.groups.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as GroupCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'groups.groups.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole } = result as GroupCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), actingRole }
      },
    },
    delete: {
      commandId: 'groups.groups.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Groups' })

export const openApi = buildOpenApi({
  resourceName: 'Group',
  pluralName: 'Groups',
  querySchema: groupListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(groupListItemSchema),
  create: {
    schema: groupCreateSchema,
    description:
      'Creates a `team` or `class_group` group in a section (a coordinator in their sections, the club administrator anywhere). Errors: 400 invalid input, 403 `scope_denied`, 422 `group_team_fields_on_class_group`, `groups_reference_invalid`, `group_section_inactive`.',
  },
  update: {
    schema: groupUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes a group; send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Moving it to another section needs the scope of both sections. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 422 `group_team_fields_on_class_group`, `groups_reference_invalid`, `group_section_inactive`.',
  },
  del: {
    schema: groupDeleteSchema,
    description:
      'Soft-deletes a group without memberships (`?id=`); send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `group_has_memberships` (deactivate it instead).',
  },
})
