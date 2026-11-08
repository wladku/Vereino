// `/api/facilities/incidents` — incidents at the club's places (facilities spec the CRUD row for `/incidents`,
// REQ-016, §6 of the regulations; M-12 "Report incident", B-27; #126): listed and reported with
// `facilities.log.write`; the actions taken and the linked case are changed with `facilities.incidents.manage`. There
// is no DELETE: an incident is evidence and is never deleted. The description and the people involved are decrypted
// by the query engine.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { INCIDENT_REPORT_KINDS, type IncidentCommandResult } from '../../commands/incidents'
import { Incident } from '../../data/entities'
import { incidentCreateSchema, incidentListQuerySchema, incidentUpdateSchema } from '../../data/validators'
import { INCIDENT_ENTITY_ID, attachIncidentNames, incidentListItem, incidentListItemSchema } from '../records'
import { FACILITY_COLUMNS, updateResponseSchema } from '../shared'

type IncidentListQuery = z.infer<typeof incidentListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.log.write'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.log.write'] },
    PUT: { requireAuth: true, requireFeatures: ['facilities.incidents.manage'] },
  },
  orm: {
    entity: Incident,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: incidentListQuerySchema,
    entityId: INCIDENT_ENTITY_ID,
    fields: [
      'id',
      'place_id',
      'occurred_at',
      'reported_by_person_id',
      'kind',
      'description',
      'involved',
      'action_taken',
      'thread_id',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { occurredAt: 'occurred_at', createdAt: 'created_at', updatedAt: 'updated_at' },
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: IncidentListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.kind) business.push({ kind: query.kind })
      return { $and: [scopeWhere(scope, INCIDENT_REPORT_KINDS, FACILITY_COLUMNS), ...business] } as Where
    },
    transformItem: incidentListItem,
  },
  hooks: {
    afterList: attachIncidentNames,
  },
  actions: {
    create: {
      commandId: 'facilities.incidents.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as IncidentCommandResult
        return { id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
      status: 201,
    },
    update: {
      commandId: 'facilities.incidents.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as IncidentCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'Incident',
  pluralName: 'Incidents',
  querySchema: incidentListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(incidentListItemSchema),
  create: {
    schema: incidentCreateSchema,
    responseSchema: z.object({ id: z.uuid(), updatedAt: z.string() }),
    description:
      'Reports an incident at a place (M-12). The description must not hold health data. Errors: 400 invalid input, 403 `scope_denied`, 403 `scope_unlinked` (no person), 422 `incident_description_length` (10–2000 characters), 422 `incident_time_future`, 422 `facilities_reference_invalid` (unknown place). Incidents are never deleted.',
  },
  update: {
    schema: incidentUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Records further actions taken and links the communication case the incident is followed in (B-27). Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
