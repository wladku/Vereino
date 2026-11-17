// `GET /api/payments/charges` — the club's charges (payments spec API table, REQ-011; B-21; issues #108, #109):
// filtered by the period label, a missing payer, the debtor, the payer, the status (one or several), the generation,
// the source type, the payee, `overdue=1` (`open` or `partially_paid` past the due date in the club's calendar), a
// payment method that was not reversed (`paymentMethod=cash`, the "Cash payments" perspective) and the debtor's or
// payer's name (`search`, through the people directory's hashed name tokens — three letters or more). The list adds
// the debtor's and payer's names, the payer and payee institutions of a rental charge (#291), the discount rule's
// name, what was paid, what remains and the overdue marker; `meta.rentalsPerspective` says whether B-21 shows
// "Rentals (municipality)" (DD-C02). Without a sort the newest period comes first, then the due date (Contract 3, #292).
// `involvesPersonId` keeps the charges the person owes or pays (the person record's "Charges" tab, #295).
//
// `POST /api/payments/charges` — `payments.charges.create_manual` (payments parity spec REQ-C06, DD-C12; B-21 and the
// person record's "Add charge"; #295): a charge entered by hand, payable to the club; 201 `{ chargeId, payerMissing }`.
import { z } from 'zod'
import { makeCrudRoute, type CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { createCrudOpenApiFactory, createPagedListResponseSchema } from '@open-mercato/shared/lib/openapi/crud'
import type { Where } from '@open-mercato/shared/lib/query/types'
import { scopeWhere } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type { ManualChargeResult } from '../../commands/ledger'
import { Charge } from '../../data/entities'
import { chargeListQuerySchema, chargeManualCreateSchema, flagSet } from '../../data/validators'
import { OPEN_CHARGE_STATUSES, amountDueOf, isOverdue, remainingOf } from '../../lib/charge-ledger'
import { clubClock, findInstitutions, findPersons, searchPersonIds } from '../../services/directory'
import { chargesPaidBy, paidTotals, rentalsPerspective } from '../../services/ledger'
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
async function attachNames(payload: { items?: unknown[]; meta?: unknown }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as ChargeListItem[]
  const scope = listScope(ctx)
  if (!scope) return
  payload.meta = { rentalsPerspective: await rentalsPerspective(ctx.container, scope) }
  if (items.length === 0) return
  const personIds = items.flatMap((item) => [item.personId, item.payerPersonId]).filter((id): id is string => !!id)
  const institutionIds = items
    .flatMap((item) => [item.payerInstitutionId, item.payeeInstitutionId])
    .filter((id): id is string => !!id)
  const ruleIds = items.flatMap((item) => (item.discountRuleId ? [item.discountRuleId] : []))
  const [persons, institutions, ruleNames, paid, clock] = await Promise.all([
    findPersons(ctx.container, scope, personIds),
    findInstitutions(ctx.container, scope, institutionIds),
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
    item.payerInstitution = item.payerInstitutionId ? (institutions.get(item.payerInstitutionId) ?? null) : null
    item.payeeInstitution = item.payeeInstitutionId ? (institutions.get(item.payeeInstitutionId) ?? null) : null
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
  if (query.involvesPersonId) {
    where.push({
      $or: [{ person_id: query.involvesPersonId }, { payer_person_id: query.involvesPersonId }],
    } as Where)
  }
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

const rawBodySchema = z.object({}).loose()

const createResponseSchema = z.object({
  chargeId: z.uuid(),
  payerMissing: z.boolean().describe('No payer was named and the *Payer* rule found none'),
})

export const { metadata, GET, POST } = makeCrudRoute({
  metadata: {
    GET: { requireAuth: true, requireFeatures: ['payments.view'] },
    POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
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
      'payer_institution_id',
      'payee_institution_id',
      'payer_label',
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
    sortFieldMap: {
      periodLabel: 'period_label',
      dueDate: 'due_date',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // Contract 3 of the payments parity spec (approved 2026-11-16, #292): the newest period first, then the due date;
    // a client may still pass its own sort.
    defaultSort: { field: 'periodLabel', dir: 'desc' },
    tiebreakSortField: 'dueDate',
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
  actions: {
    create: {
      commandId: 'payments.charges.create_manual',
      schema: rawBodySchema,
      mapInput: ({ parsed }) => parsed as Record<string, unknown>,
      response: ({ result }) => {
        const { entity } = result as ManualChargeResult
        return { chargeId: entity.id, payerMissing: entity.payerMissing }
      },
      status: 201,
    },
  },
})

const buildOpenApi = createCrudOpenApiFactory({ defaultTag: 'Payments' })

export const openApi = buildOpenApi({
  resourceName: 'Charge',
  pluralName: 'Charges',
  querySchema: chargeListQuerySchema,
  listResponseSchema: createPagedListResponseSchema(chargeListItemSchema).extend({
    meta: z
      .object({
        rentalsPerspective: z
          .boolean()
          .describe('DD-C02: show "Rentals (municipality)" — `facilities` is enabled or a live rental charge exists'),
      })
      .optional(),
  }),
  create: {
    schema: chargeManualCreateSchema,
    responseSchema: createResponseSchema,
    description:
      "Adds a charge by hand (`source_type = manual`), payable to the club: the debtor, a description of 3–200 characters, 1 grosz to PLN 100 000 and a due date from 12 months before to 12 months after the club's today. `payerPersonId` must be an active guardian of the debtor or the adult debtor; omitted, the payer is the debtor's primary payer, else the adult debtor, else the charge is created without a payer (`payerMissing: true`). Audited and never edited: a wrong charge is cancelled and created again. Errors: 400 invalid input, 403 `scope_denied`, 404 person, 422 `charge_due_date_out_of_range`, 422 `charge_payer_not_eligible`.",
  },
})
