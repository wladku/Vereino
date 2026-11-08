// `/api/payments/order-campaigns` — order campaigns (payments spec API table, REQ-032, DD-30; issue #115, B-30, B-31):
// the club administrator lists the campaigns with their section, groups, deadline, stage and KPIs (orders out of
// children, value, paid, handed over) and creates or changes one through the `payments` commands — the whole form
// with its products nested. "Save and open collection" sends `open: true`.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { OrderCampaignCommandResult } from '../../commands/order-campaigns'
import { OrderCampaign } from '../../data/entities'
import {
  orderCampaignCreateSchema,
  orderCampaignListQuerySchema,
  orderCampaignUpdateSchema,
} from '../../data/validators'
import {
  CLUB_WIDE_COLUMNS,
  ORDER_CAMPAIGN_ENTITY_ID,
  PAYMENTS_READ_KINDS,
  attachCampaignFacts,
  orderCampaignListItem,
  orderCampaignListItemSchema,
} from '../shared'

type CampaignListQuery = z.infer<typeof orderCampaignListQuerySchema>

const rawBodySchema = z.object({}).loose()

const saveResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.string(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

function saveResponse(result: unknown) {
  const { entity, actingRole } = result as OrderCampaignCommandResult
  return { ok: true, id: entity.id, status: entity.status, updatedAt: entity.updatedAt.toISOString(), actingRole }
}

export const { metadata, GET, POST, PUT } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
    POST: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
  },
  orm: {
    entity: OrderCampaign,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: orderCampaignListQuerySchema,
    entityId: ORDER_CAMPAIGN_ENTITY_ID,
    fields: [
      'id',
      'name',
      'section_id',
      'group_ids',
      'closes_on',
      'payment_due_on',
      'status',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      name: 'name',
      closesOn: 'closes_on',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: CampaignListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.status) business.status = query.status
      if (query.sectionId) business.section_id = query.sectionId
      return { $and: [scopeWhere(scope, PAYMENTS_READ_KINDS, CLUB_WIDE_COLUMNS), business] } as Where
    },
    transformItem: orderCampaignListItem,
  },
  hooks: {
    afterList: attachCampaignFacts,
  },
  actions: {
    create: {
      commandId: 'payments.order_campaigns.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => saveResponse(result),
      status: 201,
    },
    update: {
      commandId: 'payments.order_campaigns.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => saveResponse(result),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Payments' })

export const openApi = buildOpenApi({
  resourceName: 'OrderCampaign',
  pluralName: 'OrderCampaigns',
  querySchema: orderCampaignListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(orderCampaignListItemSchema),
  create: {
    schema: orderCampaignCreateSchema,
    responseSchema: saveResponseSchema,
    description:
      'Creates an order campaign (club administrator): name 3–120, description ≤ 1000, one section and at least one of its groups, `closesOn` ≥ today, `paymentDueOn` ≥ `closesOn`, personalisation, a notes question, the supplier and the products (prices in grosz; at most one set of at least two single products, referenced by `key`). `open: true` opens collection at once. Errors: 400 invalid input ("Select at least one group"), 403 `scope_denied`, 422 `order_closes_on_past`, `order_payment_due_before_close`, `order_section_unknown`, `order_groups_invalid`, `order_set_too_many`, `order_set_too_small`, `order_set_component_invalid`, `order_adult_price_missing` (each with `fieldErrors`).',
  },
  update: {
    schema: orderCampaignUpdateSchema,
    responseSchema: saveResponseSchema,
    description:
      'Changes an order campaign in `draft` or `open` with the whole form again; a product sent with its `id` is changed (placed orders keep their prices), one without is added, a stored product not sent is removed. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `order_campaign_not_editable`, `order_product_in_use`, `optimistic_lock_conflict`, and the 422s of the create.',
  },
})
