// `GET /api/payments/charges` — the club's charges (payments spec API table, REQ-011; B-21; issues #108, #109):
// filtered by the period label, a missing payer, the debtor, the payer, the status (one or several), the generation,
// the source type, the payee, `overdue=1` (`open` or `partially_paid` past the due date in the club's calendar), a
// payment method that was not reversed (`paymentMethod=cash`, the "Cash payments" perspective) and the debtor's or
// payer's name (`search`, through the people directory's hashed name tokens — three letters or more). The list adds
// the debtor's and payer's names, the discount rule's name, what was paid, what remains and the overdue marker.
import type { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Charge } from '../../data/entities'
import { chargeListQuerySchema, flagSet } from '../../data/validators'
import { OPEN_CHARGE_STATUSES, amountDueOf, isOverdue, remainingOf } from '../../lib/charge-ledger'
import { clubClock, findPersons, searchPersonIds } from '../../services/directory'
import { chargesPaidBy, paidTotals } from '../../services/ledger'
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

/** No charge has this id: an id filter that must match nothing. */
const NO_CHARGE_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Adds the debtor's and the payer's names, the discount rule's name (deleted rules keep their name), what was paid,
 * what remains and the overdue marker in the club's calendar.
 */
async function attachNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as ChargeListItem[]
  const scope = listScope(ctx)
  if (items.length === 0 || !scope) return
  const personIds = items.flatMap((item) => [item.personId, item.payerPersonId]).filter((id): id is string => !!id)
  const ruleIds = items.flatMap((item) => (item.discountRuleId ? [item.discountRuleId] : []))
  const [persons, ruleNames, paid, clock] = await Promise.all([
    findPersons(ctx.container, scope, personIds),
    discountRuleNames(ctx.container, scope, ruleIds),
    paidTotals(
      ctx.container,
      scope,
      items.map((item) => item.id),
    ),
    clubClock(ctx.container, scope),
  ])
  const nameOf = (id: string | null) => {
    const person = id ? persons.get(id) : undefined
    return person ? { firstName: person.firstName, lastName: person.lastName } : null
  }
  for (const item of items) {
    item.person = nameOf(item.personId)
    item.payer = nameOf(item.payerPersonId)
    item.discountRuleName = item.discountRuleId ? (ruleNames.get(item.discountRuleId) ?? null) : null
    item.paid = paid.get(item.id) ?? 0
    item.remaining = item.status === 'cancelled' ? 0 : remainingOf(amountDueOf(item), item.paid)
    item.overdue = isOverdue(item, clock.today)
  }
}

/** The business filters of the list (the record scope is added next to them). */
async function businessFilters(query: ChargeListQuery, ctx: CrudCtx): Promise<Where[]> {
  const scope = listScope(ctx)
  const where: Where[] = []
  const business: Record<string, unknown> = {}
  if (query.period) business.period_label = query.period
  if (query.payerMissing) business.payer_missing = flagSet(query.payerMissing)
  if (query.personId) business.person_id = query.personId
  if (query.payerPersonId) business.payer_person_id = query.payerPersonId
  if (query.status) {
    const statuses = query.status
      .split(',')
      .map((status) => status.trim())
      .filter(Boolean)
    // Never an empty `$in`: a status filter of only commas filters nothing.
    if (statuses.length === 1) business.status = statuses[0]
    else if (statuses.length > 1) business.status = { $in: statuses }
  }
  if (query.generationId) business.generation_id = query.generationId
  if (query.sourceType) business.source_type = query.sourceType
  if (query.payee) business.payee = query.payee
  where.push(business as Where)
  if (!scope) return where
  if (flagSet(query.overdue)) {
    const { today } = await clubClock(ctx.container, scope)
    where.push({ status: { $in: [...OPEN_CHARGE_STATUSES] }, due_date: { $lt: today } } as Where)
  }
  if (query.paymentMethod) {
    const ids = await chargesPaidBy(ctx.container, scope, query.paymentMethod)
    where.push({ id: { $in: ids.length > 0 ? ids : [NO_CHARGE_ID] } } as Where)
  }
  if (query.search) {
    const found = await searchPersonIds(ctx.container, scope, query.search)
    const ids = found && found.size > 0 ? [...found] : [NO_CHARGE_ID]
    where.push({ $or: [{ person_id: { $in: ids } }, { payer_person_id: { $in: ids } }] } as Where)
  }
  return where
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
      'payee',
      'status',
      'generation_id',
      'cancel_reason',
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
      return {
        $and: [scopeWhere(scope, PAYMENTS_READ_KINDS, CLUB_WIDE_COLUMNS), ...(await businessFilters(query, ctx))],
      } as Where
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
