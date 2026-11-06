// `/api/facilities/zone-rules` — the weekly zones of the club's places (facilities spec glossary *Zone*, the CRUD row
// of *API, Command, and Error Contracts*; REQ-013, REQ-029; #121): read with `facilities.view` by the club
// administrator, written with `facilities.manage` through the `facilities.zone_rules.*` commands (equal-priority
// overlap → 409 `zone_rule_overlap`, times out of order → 422 `zone_rule_times_invalid`). The week preview and the
// weekly availability table are computed on the client from this list.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { READ_KINDS } from '../../commands/shared'
import type { ZoneRuleCommandResult } from '../../commands/zone-rules'
import { ZoneRule } from '../../data/entities'
import {
  zoneRuleCreateSchema,
  zoneRuleDeleteSchema,
  zoneRuleListQuerySchema,
  zoneRuleUpdateSchema,
} from '../../data/validators'
import {
  FACILITY_COLUMNS,
  ZONE_RULE_ENTITY_ID,
  updateResponseSchema,
  zoneRuleListItem,
  zoneRuleListItemSchema,
} from '../shared'

type ZoneRuleListQuery = z.infer<typeof zoneRuleListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['facilities.view'] },
    POST: { requireAuth: true, requireFeatures: ['facilities.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['facilities.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['facilities.manage'] },
  },
  orm: {
    entity: ZoneRule,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: zoneRuleListQuerySchema,
    entityId: ZONE_RULE_ENTITY_ID,
    fields: [
      'id',
      'place_id',
      'weekdays',
      'time_from',
      'time_to',
      'zone',
      'priority',
      'source',
      'valid_from',
      'valid_to',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { priority: 'priority', validFrom: 'valid_from', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: ZoneRuleListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where[] = []
      if (query.placeId) business.push({ place_id: query.placeId })
      if (query.zone) business.push({ zone: query.zone })
      if (query.source) business.push({ source: query.source })
      return { $and: [scopeWhere(scope, READ_KINDS, FACILITY_COLUMNS), ...business] } as Where
    },
    transformItem: zoneRuleListItem,
  },
  actions: {
    create: {
      commandId: 'facilities.zone_rules.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as ZoneRuleCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'facilities.zone_rules.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as ZoneRuleCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString() }
      },
    },
    delete: {
      commandId: 'facilities.zone_rules.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Facilities' })

export const openApi = buildOpenApi({
  resourceName: 'Zone rule',
  pluralName: 'Zone rules',
  querySchema: zoneRuleListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(zoneRuleListItemSchema),
  create: {
    schema: zoneRuleCreateSchema,
    description:
      'Creates a weekly zone rule on a place (club administrator): weekdays 1–7, club-zone wall times, zone, priority 1–9, validity. Errors: 400 invalid input, 403 `scope_denied`, 409 `zone_rule_overlap` (an overlapping rule with equal priority), 422 `zone_rule_times_invalid`, 422 `facilities_reference_invalid` (unknown place), 422 `validity_inverted`.',
  },
  update: {
    schema: zoneRuleUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes a zone rule; the place and the source are fixed. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 409 `zone_rule_overlap`, 422 `zone_rule_times_invalid`, 422 `validity_inverted`.',
  },
  del: {
    schema: zoneRuleDeleteSchema,
    description:
      'Soft-deletes a zone rule (`?id=`); send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
