// `/api/facilities/logs` — the facility log (facilities spec the CRUD row for `/logs`, REQ-016; M-12 "Open facility",
// today's groups, "Close facility"; B-27; #126): listed, started and updated with `facilities.log.write`. One log per
// place and day; after the end of the next day only the club administrator edits it (403 `log_edit_closed`). The
// remarks are decrypted by the query engine. There is no DELETE: a log is part of the facility's record.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { LogCommandResult } from '../../commands/logs'
import { LOG_KINDS } from '../../commands/logs'
import { FacilityLog } from '../../data/entities'
import { logCreateSchema, logListQuerySchema, logUpdateSchema } from '../../data/validators'
import { LOG_ENTITY_ID, attachLogNames, logListItem, logListItemSchema } from '../records'
import { PLACE_COLUMNS, updateResponseSchema } from '../shared'

type LogListQuery = z.infer<typeof logListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.log.write'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.log.write'] },
    PUT: { requireAuth: true, requireFeatures: ['facilities.log.write'] },
  },
  orm: {
    entity: FacilityLog,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: logListQuerySchema,
    entityId: LOG_ENTITY_ID,
    fields: [
      'id',
      'place_id',
      'log_date',
      'operator_person_id',
      'opened_at',
      'closed_at',
      'condition_before',
      'condition_after',
      'groups_present',
      'remarks',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { logDate: 'log_date', createdAt: 'created_at', updatedAt: 'updated_at' },
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: LogListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.from) business.push({ log_date: { $gte: query.from } })
      if (query.to) business.push({ log_date: { $lte: query.to } })
      return { $and: [scopeWhere(scope, LOG_KINDS, PLACE_COLUMNS), ...business] } as Where
    },
    transformItem: logListItem,
  },
  hooks: {
    afterList: attachLogNames,
  },
  actions: {
    create: {
      commandId: 'facilities.logs.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as LogCommandResult
        return { id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
      status: 201,
    },
    update: {
      commandId: 'facilities.logs.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as LogCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'FacilityLog',
  pluralName: 'FacilityLogs',
  querySchema: logListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(logListItemSchema),
  create: {
    schema: logCreateSchema,
    responseSchema: z.object({ id: z.uuid(), updatedAt: z.string() }),
    description:
      'Starts the log of a place for a day (M-12 "Open facility": `openedAt` with `conditionBefore`). Errors: 400 invalid input, 403 `scope_denied`, 403 `scope_unlinked` (no person), 403 `log_edit_closed` (the day after next; administrator only), 409 `log_exists` (with the existing `id` and `updatedAt`), 422 `log_date_invalid` (a later day), 422 `log_condition_required`, 422 `log_not_opened`, 422 `log_period_invalid`, 422 `log_groups_invalid`, 422 `facilities_reference_invalid` (unknown place, or a group naming a session or rental of another place).',
  },
  update: {
    schema: logUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes the given fields of a log (M-12 today’s groups, "Close facility": `closedAt` with `conditionAfter`). Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 403 `log_edit_closed`, 404, 409 `optimistic_lock_conflict`, 422 as for create.',
  },
})
