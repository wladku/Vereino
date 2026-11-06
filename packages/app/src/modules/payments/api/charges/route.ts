// `GET /api/payments/charges` — the club's charges (payments spec API table, REQ-011; B-21; issue #108): filtered by
// the period label, a missing payer, the debtor, the payer, the status and the generation, newest due date first.
// The list adds the debtor's and payer's names and the name of the discount rule. Recording payments, cancelling and
// the overdue perspective arrive with E07-S02.
import type { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Charge } from '../../data/entities'
import { chargeListQuerySchema } from '../../data/validators'
import { findPersons } from '../../services/directory'
import { discountRuleNames } from '../../services/read'
import {
  CHARGE_ENTITY_ID,
  CLUB_WIDE_COLUMNS,
  PAYMENTS_READ_KINDS,
  chargeListItem,
  chargeListItemSchema,
  listScope,
  type ChargeListItem,
} from '../shared'

type ChargeListQuery = z.infer<typeof chargeListQuerySchema>

/** Adds the debtor's and the payer's names and the discount rule's name (deleted rules keep their name). */
async function attachNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as ChargeListItem[]
  const scope = listScope(ctx)
  if (items.length === 0 || !scope) return
  const personIds = items.flatMap((item) => [item.personId, item.payerPersonId]).filter((id): id is string => !!id)
  const ruleIds = items.flatMap((item) => (item.discountRuleId ? [item.discountRuleId] : []))
  const [persons, ruleNames] = await Promise.all([
    findPersons(ctx.container, scope, personIds),
    discountRuleNames(ctx.container, scope, ruleIds),
  ])
  const nameOf = (id: string | null) => {
    const person = id ? persons.get(id) : undefined
    return person ? { firstName: person.firstName, lastName: person.lastName } : null
  }
  for (const item of items) {
    item.person = nameOf(item.personId)
    item.payer = nameOf(item.payerPersonId)
    item.discountRuleName = item.discountRuleId ? (ruleNames.get(item.discountRuleId) ?? null) : null
  }
}

export const { metadata, GET } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['payments.view'] },
  },
  orm: {
    entity: Charge,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: chargeListQuerySchema,
    entityId: CHARGE_ENTITY_ID,
    fields: [
      'id',
      'source_type',
      'source_id',
      'person_id',
      'payer_person_id',
      'payer_missing',
      'period_label',
      'description',
      'amount',
      'discount_amount',
      'discount_rule_id',
      'due_date',
      'status',
      'generation_id',
      'tenant_id',
      'organization_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: { dueDate: 'due_date', createdAt: 'created_at', updatedAt: 'updated_at' },
    // A full export would skip `buildFilters` and with it the record scope.
    export: { enabled: false },
    disableListCache: true,
    buildFilters: async (query: ChargeListQuery, ctx: CrudCtx): Promise<Where> => {
      const scope = await scopeContract.resolve(ctx)
      const business: Where = {}
      if (query.period) business.period_label = query.period
      if (query.payerMissing) business.payer_missing = query.payerMissing === '1' || query.payerMissing === 'true'
      if (query.personId) business.person_id = query.personId
      if (query.payerPersonId) business.payer_person_id = query.payerPersonId
      if (query.status) business.status = query.status
      if (query.generationId) business.generation_id = query.generationId
      return { $and: [scopeWhere(scope, PAYMENTS_READ_KINDS, CLUB_WIDE_COLUMNS), business] } as Where
    },
    transformItem: chargeListItem,
  },
  hooks: {
    afterList: attachNames,
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Payments' })

export const openApi = buildOpenApi({
  resourceName: 'Charge',
  pluralName: 'Charges',
  querySchema: chargeListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(chargeListItemSchema),
})
