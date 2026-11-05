// `/api/payments/discount-rules` — discount rules (payments spec API table, REQ-011; R12, Q-006; B-20 Discounts; issue
// #108): `sibling` rules (a percent, the full-rate child, the fee periods) and `custom` rules (a percent or an amount for
// named persons), read and written by the club administrator through the `payments` commands. The list adds the
// names of a custom rule's persons.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { DiscountRuleCommandResult } from '../../commands/discount-rules'
import { DiscountRule } from '../../data/entities'
import {
  discountRuleCreateSchema,
  discountRuleDeleteSchema,
  discountRuleListQuerySchema,
  discountRuleUpdateSchema,
} from '../../data/validators'
import {
  CLUB_WIDE_COLUMNS,
  DISCOUNT_RULE_ENTITY_ID,
  PAYMENTS_READ_KINDS,
  attachRulePersons,
  discountRuleListItem,
  discountRuleListItemSchema,
  updateResponseSchema,
} from '../shared'

type DiscountRuleListQuery = z.infer<typeof discountRuleListQuerySchema>

const rawBodySchema = z.object({}).loose()

export const { metadata, GET, POST, PUT, DELETE } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['payments.manage'] },
    POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
    PUT: { requireAuth: true, requireFeatures: ['payments.manage'] },
    DELETE: { requireAuth: true, requireFeatures: ['payments.manage'] },
  },
  orm: {
    entity: DiscountRule,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: discountRuleListQuerySchema,
    entityId: DISCOUNT_RULE_ENTITY_ID,
    fields: [
      'id',
      'name',
      'kind',
      'percent',
      'amount',
      'conditions',
      'valid_from',
      'valid_to',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      name: 'name',
      kind: 'kind',
      validFrom: 'valid_from',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: DiscountRuleListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.search) business.name = { $ilike: `%${escapeLikePattern(query.search)}%` }
      if (query.kind) business.kind = query.kind
      return { $and: [scopeWhere(scope, PAYMENTS_READ_KINDS, CLUB_WIDE_COLUMNS), business] } as Where
    },
    transformItem: discountRuleListItem,
  },
  hooks: {
    afterList: attachRulePersons,
  },
  actions: {
    create: {
      commandId: 'payments.discount_rules.create',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => ({ id: (result as DiscountRuleCommandResult).entity.id }),
      status: 201,
    },
    update: {
      commandId: 'payments.discount_rules.update',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity, actingRole } = result as DiscountRuleCommandResult
        return { ok: true, id: entity.id, updatedAt: entity.updatedAt.toISOString(), actingRole }
      },
    },
    delete: {
      commandId: 'payments.discount_rules.delete',
      mapInput: ({ raw }) => ({ id: (raw as { query?: { id?: unknown } }).query?.id }),
      response: () => ({ ok: true }),
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Payments' })

export const openApi = buildOpenApi({
  resourceName: 'DiscountRule',
  pluralName: 'DiscountRules',
  querySchema: discountRuleListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(discountRuleListItemSchema),
  create: {
    schema: discountRuleCreateSchema,
    description:
      'Creates a discount rule (club administrator). `sibling`: `percent` 1–100 and `conditions { fullRate: oldest|youngest, feePeriods }` (defaults: the oldest pays the full rate, monthly fees only). `custom`: `percent` 1–100 or `amount` (grosz) and `conditions { personIds, feePeriods }`. Errors: 400 invalid input, 403 `scope_denied`, 422 `discount_value_invalid`, 422 `discount_conditions_invalid`, 422 `validity_inverted`.',
  },
  update: {
    schema: discountRuleUpdateSchema,
    responseSchema: updateResponseSchema,
    description:
      'Changes a discount rule (the kind is fixed); sending `percent` or `amount` replaces both, `conditions` replaces the stored conditions. Charges already issued keep their discounts. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 422 `discount_value_invalid`, 422 `discount_conditions_invalid`, 422 `validity_inverted`.',
  },
  del: {
    schema: discountRuleDeleteSchema,
    description:
      'Soft-deletes a discount rule (`?id=`). Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`.',
  },
})
