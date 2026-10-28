// `/api/people/role-assignments` — staff role assignments (club spec API table, DD-33): list filtered by the record
// scope (its person, the coordinator of its section, the club administrator), create and update through commands.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { RoleAssignment } from '../../data/entities'
import {
  roleAssignmentCreateSchema,
  roleAssignmentListQuerySchema,
  roleAssignmentUpdateSchema,
} from '../../data/validators'
import { ASSIGNMENT_COLUMNS, ASSIGNMENT_READ_KINDS, roleAssignmentListItem, roleAssignmentViewSchema } from '../shared'

type AssignmentListQuery = z.infer<typeof roleAssignmentListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['people.view'] },
    POST: { requireAuth: true, requireFeatures: ['people.roles.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['people.roles.manage'] },
  },
  orm: {
    entity: RoleAssignment,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: roleAssignmentListQuerySchema,
    entityId: 'people:role_assignment',
    fields: [
      'id',
      'person_id',
      'role',
      'section_id',
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
    buildFilters: async (query: AssignmentListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.personId) business.person_id = query.personId
      if (query.sectionId) business.section_id = query.sectionId
      if (query.role) business.role = query.role
      return { $and: [scopeWhere(scope, ASSIGNMENT_READ_KINDS, ASSIGNMENT_COLUMNS), business] } as Where
    },
    transformItem: roleAssignmentListItem,
  },
  actions: {
    create: {
      commandId: 'people.role_assignments.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as { assignment: RoleAssignment }).assignment.id }),
      status: 201,
    },
    update: {
      commandId: 'people.role_assignments.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { assignment } = result as { assignment: RoleAssignment }
        return { ok: true, id: assignment.id, updatedAt: assignment.updatedAt.toISOString() }
      },
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'People' })

export const openApi = buildOpenApi({
  resourceName: 'Role assignment',
  pluralName: 'Role assignments',
  querySchema: roleAssignmentListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(roleAssignmentViewSchema),
  create: {
    schema: roleAssignmentCreateSchema,
    description:
      'Assigns a staff role for a period (club administrator). Errors: 403 `scope_denied`, 404 unknown person, 422 `role_scope_required`, `role_scope_unexpected`, `validity_inverted`.',
  },
  update: {
    schema: roleAssignmentUpdateSchema,
    responseSchema: z.object({ ok: z.literal(true), id: z.uuid(), updatedAt: z.string() }),
    description:
      'Changes an assignment; send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 409 `optimistic_lock_conflict`, 422 `validity_inverted`.',
  },
})
