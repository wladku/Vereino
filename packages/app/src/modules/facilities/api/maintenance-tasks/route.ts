// `/api/facilities/maintenance-tasks` — maintenance tasks of the club's places (facilities spec the CRUD row and
// glossary *Maintenance task*; REQ-022, DD-36; B-27 maintenance tab, M-11 "Plan maintenance"; #128): listed, planned
// and changed with `facilities.maintenance.manage` — the club administrator for every place, a place maintainer for
// the places assigned to them (the `maintenance_planner` grant; the list is filtered by it). A window over existing
// entries marks them to be moved (`flagged`); `status: 'cancelled'` cancels a task. No DELETE: a task is cancelled.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { MAINTENANCE_KINDS_ALLOWED, type MaintenanceCommandResult } from '../../commands/maintenance'
import { MaintenanceTask } from '../../data/entities'
import {
  maintenanceTaskCreateSchema,
  maintenanceTaskListQuerySchema,
  maintenanceTaskUpdateSchema,
} from '../../data/validators'
import {
  MAINTENANCE_TASK_ENTITY_ID,
  attachMaintenanceNames,
  maintenanceTaskListItem,
  maintenanceTaskListItemSchema,
} from '../maintenance-records'
import { rescheduleCountsSchema, updateResponseSchema } from '../shared'

type TaskListQuery = z.infer<typeof maintenanceTaskListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.maintenance.manage'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.maintenance.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['facilities.maintenance.manage'] },
  },
  orm: {
    entity: MaintenanceTask,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: maintenanceTaskListQuerySchema,
    entityId: MAINTENANCE_TASK_ENTITY_ID,
    fields: [
      'id',
      'place_id',
      'kind',
      'responsible',
      'schedule_type',
      'starts_at',
      'ends_at',
      'due_date',
      'recurrence_rule',
      'usage_hours_threshold',
      'usage_counted_from',
      'series_id',
      'status',
      'planned_by_person_id',
      'done_at',
      'done_by_person_id',
      'cost',
      'notes',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { startsAt: 'starts_at', dueDate: 'due_date', createdAt: 'created_at', updatedAt: 'updated_at' },
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: TaskListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.status) business.push({ status: query.status })
      if (query.scheduleType) business.push({ schedule_type: query.scheduleType })
      return { $and: [scopeWhere(scope, MAINTENANCE_KINDS_ALLOWED, { placeId: 'place_id' }), ...business] } as Where
    },
    transformItem: maintenanceTaskListItem,
  },
  hooks: {
    afterList: attachMaintenanceNames,
  },
  actions: {
    create: {
      commandId: 'facilities.maintenance.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, flagged } = result as MaintenanceCommandResult
        return { id: entity.id, updatedAt: entity.updatedAt.toISOString(), flagged }
      },
      status: 201,
    },
    update: {
      commandId: 'facilities.maintenance.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, flagged } = result as MaintenanceCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), status: entity.status, flagged }
      },
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'MaintenanceTask',
  pluralName: 'MaintenanceTasks',
  querySchema: maintenanceTaskListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(maintenanceTaskListItemSchema),
  create: {
    schema: maintenanceTaskCreateSchema,
    responseSchema: z.object({ id: z.uuid(), updatedAt: z.string(), flagged: rescheduleCountsSchema }),
    description:
      'Plans a maintenance task on a place: a window (`startsAt`–`endsAt`; it blocks the slot like a closure and marks the sessions, rentals and internal bookings under it to be moved — `flagged`), a due date (`one_off`, or `date_recurring` with an RRULE `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY[;INTERVAL=n]`), or a usage threshold (`usage_hours`). The club administrator plans on every place, a place maintainer on the places assigned to them. Errors: 400 invalid input, 403 `scope_denied` (a place the caller does not maintain), 403 `scope_unlinked` (no person), 422 `maintenance_window_invalid`, `maintenance_schedule_invalid`, `maintenance_usage_threshold_invalid`, `facilities_reference_invalid` (unknown place).',
  },
  update: {
    schema: maintenanceTaskUpdateSchema,
    responseSchema: updateResponseSchema.extend({ status: z.string(), flagged: rescheduleCountsSchema }),
    description:
      'Changes a planned task; a moved window marks the entries in the new time (`flagged`) and re-emits `facilities.maintenance.scheduled`; `status: "cancelled"` cancels it. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `maintenance_task_closed` (done or cancelled), 409 `invalid_transition`, 422 as for create.',
  },
})
