// `GET /api/activities/occurrences` — sessions in the record scope (club spec API table, REQ-005, REQ-006): the coach's
// groups, the coordinator's sections, the club administrator's club; filters `status`, `from`, `to` (slot dates),
// `sectionId`, `groupId`, `activityId`, `needsReschedule`; the activity, group, place and coach names are added to the
// rows the scope filter admitted. Sessions are written through the activity, the move route and the cancel route.
import type { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Occurrence } from '../../data/entities'
import { occurrenceListQuerySchema } from '../../data/validators'
import {
  OCCURRENCE_ENTITY_ID,
  OCCURRENCE_LIST_COLUMNS,
  SCHEDULE_READ_KINDS,
  attachOccurrenceNames,
  occurrenceListItem,
  occurrenceListItemSchema,
} from '../shared'

type OccurrenceListQuery = z.infer<typeof occurrenceListQuerySchema>

export const { metadata, GET } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['activities.view'] },
  },
  orm: {
    entity: Occurrence,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: occurrenceListQuerySchema,
    entityId: OCCURRENCE_ENTITY_ID,
    fields: [
      'id',
      'activity_id',
      'group_id',
      'section_id',
      'occurrence_date',
      'start_at',
      'end_at',
      'place_id',
      'coach_person_id',
      'status',
      'cancel_reason',
      'is_detached',
      'needs_reschedule',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      startAt: 'start_at',
      occurrenceDate: 'occurrence_date',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: OccurrenceListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.status) business.push({ status: query.status })
      if (query.from) business.push({ occurrence_date: { $gte: query.from } })
      if (query.to) business.push({ occurrence_date: { $lte: query.to } })
      if (query.sectionId) business.push({ section_id: query.sectionId })
      if (query.groupId) business.push({ group_id: query.groupId })
      if (query.activityId) business.push({ activity_id: query.activityId })
      if (query.needsReschedule) business.push({ needs_reschedule: query.needsReschedule === 'true' })
      return { $and: [scopeWhere(scope, SCHEDULE_READ_KINDS, OCCURRENCE_LIST_COLUMNS), ...business] } as Where
    },
    transformItem: occurrenceListItem,
  },
  hooks: {
    afterList: attachOccurrenceNames,
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Activities' })

export const openApi = buildOpenApi({
  resourceName: 'Session',
  pluralName: 'Sessions',
  querySchema: occurrenceListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(occurrenceListItemSchema),
})
