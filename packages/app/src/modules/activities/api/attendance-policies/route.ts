// `/api/activities/attendance-policies` — the club's declaration policies (club spec API table, glossary *Declaration
// policy*; REQ-007; #32): read with `activities.view` by the coordinators and the club administrator (club-wide, like
// the `groups` dictionaries), written with `activities.manage` through the `activities.attendance_policies.*`
// commands (a duplicate scope key → 409 `attendance_policy_duplicate`, scope fields that do not fit → 422
// `attendance_policy_scope_invalid`).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { AttendancePolicyCommandResult } from '../../commands/policies'
import { POLICY_WRITE_KINDS, POLICY_WRITE_OPTIONS } from '../../commands/policies'
import { AttendancePolicy } from '../../data/entities'
import {
  attendancePolicyCreateSchema,
  attendancePolicyDeleteSchema,
  attendancePolicyListQuerySchema,
  attendancePolicyUpdateSchema,
} from '../../data/validators'
import {
  ATTENDANCE_POLICY_ENTITY_ID,
  attachPolicyNames,
  attendancePolicyListItem,
  attendancePolicyListItemSchema,
  updateResponseSchema,
} from '../shared'

type PolicyListQuery = z.infer<typeof attendancePolicyListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['activities.view'] },
    POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['activities.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['activities.manage'] },
  },
  orm: {
    entity: AttendancePolicy,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: attendancePolicyListQuerySchema,
    entityId: ATTENDANCE_POLICY_ENTITY_ID,
    fields: [
      'id',
      'scope',
      'group_id',
      'activity_type',
      'minor_declaration_mode',
      'confirm_timeout_hours',
      'default_after_timeout',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { scope: 'scope', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: PolicyListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.scope) business.push({ scope: query.scope })
      if (query.groupId) business.push({ group_id: query.groupId })
      return { $and: [scopeWhere(scope, POLICY_WRITE_KINDS, {}, POLICY_WRITE_OPTIONS), ...business] } as Where
    },
    transformItem: attendancePolicyListItem,
  },
  hooks: {
    afterList: attachPolicyNames,
  },
  actions: {
    create: {
      commandId: 'activities.attendance_policies.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as AttendancePolicyCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'activities.attendance_policies.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole } = result as AttendancePolicyCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), actingRole }
      },
    },
    delete: {
      commandId: 'activities.attendance_policies.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Activities' })

export const openApi = buildOpenApi({
  resourceName: 'Declaration policy',
  pluralName: 'Declaration policies',
  querySchema: attendancePolicyListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(attendancePolicyListItemSchema),
  create: {
    schema: attendancePolicyCreateSchema,
    description:
      'Creates a policy for who declares for a minor with an account (club administrator or a coordinator): `club`, `group` (with `groupId`), `away_trip` or `activity_type` (with `activityType`). Errors: 400 invalid input, 403 `scope_denied`, 409 `attendance_policy_duplicate`, 422 `attendance_policy_scope_invalid`, 422 `activities_reference_invalid` (unknown group).',
  },
  update: {
    schema: attendancePolicyUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes the mode, the confirmation limit or the default after it; the scope is fixed. Send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
  del: {
    schema: attendancePolicyDeleteSchema,
    description:
      'Soft-deletes a policy (`?id=`); the resolver then falls through to the next scope. Send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
