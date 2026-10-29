// `/api/activities/activities` — activities of both group kinds (club spec API table, REQ-005, TEST-007, TEST-012): the
// list is filtered by the record scope (`scopeWhere`: the coach's groups, the coordinator's sections, the club
// administrator's club) and adds the group, section, place and coach names; create, update and delete run the
// `activities` commands (a coordinator of another section → 403, a conflict → 409 with the list, a bad rule → 422).
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { ActivityCommandResult } from '../../commands/activities'
import { Activity } from '../../data/entities'
import {
  activityCreateSchema,
  activityDeleteSchema,
  activityListQuerySchema,
  activityUpdateSchema,
} from '../../data/validators'
import {
  ACTIVITY_ENTITY_ID,
  ACTIVITY_LIST_COLUMNS,
  SCHEDULE_READ_KINDS,
  activityListItem,
  activityListItemSchema,
  attachActivityNames,
  updateResponseSchema,
} from '../shared'

type ActivityListQuery = z.infer<typeof activityListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['activities.view'] },
    POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['activities.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['activities.manage'] },
  },
  orm: {
    entity: Activity,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: activityListQuerySchema,
    entityId: ACTIVITY_ENTITY_ID,
    fields: [
      'id',
      'section_id',
      'group_id',
      'name',
      'type',
      'default_place_id',
      'default_coach_person_id',
      'opponent_external_team_id',
      'invited_external_team_ids',
      'recurrence_rule',
      'starts_on',
      'ends_on',
      'default_start_time',
      'default_end_time',
      'generated_until',
      'description',
      'is_active',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      name: 'name',
      type: 'type',
      startsOn: 'starts_on',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: ActivityListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.sectionId) business.section_id = query.sectionId
      if (query.groupId) business.group_id = query.groupId
      if (query.type) business.type = query.type
      if (query.isActive) business.is_active = query.isActive === 'true'
      return { $and: [scopeWhere(scope, SCHEDULE_READ_KINDS, ACTIVITY_LIST_COLUMNS), business] } as Where
    },
    transformItem: activityListItem,
  },
  hooks: {
    afterList: attachActivityNames,
  },
  actions: {
    create: {
      commandId: 'activities.activities.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, changes } = result as ActivityCommandResult
        return {
          id: entity.id,
          sessionsCreated: changes.createdIds.length,
          generatedUntil: entity.generatedUntil ?? null,
        }
      },
      status: 201,
    },
    update: {
      commandId: 'activities.activities.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole, changes } = result as ActivityCommandResult
        return {
          ok: true,
          id: entity.id,
          updatedAt: entity.updatedAt.toISOString(),
          actingRole,
          sessions: {
            created: changes.createdIds.length,
            updated: changes.updatedIds.length,
            removed: changes.removedIds.length,
          },
        }
      },
    },
    delete: {
      commandId: 'activities.activities.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Activities' })

export const openApi = buildOpenApi({
  resourceName: 'Activity',
  pluralName: 'Activities',
  querySchema: activityListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(activityListItemSchema),
  create: {
    schema: activityCreateSchema,
    responseSchema: z.object({ id: z.uuid(), sessionsCreated: z.number(), generatedUntil: z.string().nullable() }),
    description:
      'Creates an activity of a group (the coordinator of its section or the club administrator) and generates its sessions for the 16-week horizon. `recurrenceRule` is the RRULE subset (`FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630`); without it the activity is a one-off on `startsOn`. Errors: 403 `scope_denied`, 404 unknown place, 409 `occurrence_place_conflict` / `occurrence_coach_conflict` with `conflicts`, 422 `recurrence_unsupported`, `recurrence_invalid`, `activity_no_sessions`, `activity_type_requires_team`, `activity_times_inverted`, `activity_dates_inverted`, `activities_reference_invalid`, `activity_group_inactive`, `place_not_bookable`.',
  },
  update: {
    schema: activityUpdateSchema,
    responseSchema: updateResponseSchema.extend({
      sessions: z.object({ created: z.number(), updated: z.number(), removed: z.number() }),
    }),
    description:
      'Changes an activity; send the lock token in the platform optimistic-lock header. A change of the rule, dates, times, place, coach or activity re-plans the future sessions; past, detached, cancelled and done sessions stay untouched. Errors: as create, plus 404 and 409 `optimistic_lock_conflict`.',
  },
  del: {
    schema: activityDeleteSchema,
    description:
      'Soft-deletes an activity and its sessions (`?id=`); send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `activity_has_sessions` (a past, cancelled or done session: deactivate it instead).',
  },
})
