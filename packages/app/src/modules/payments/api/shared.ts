// Shared pieces of the `payments` routes: the grant kinds every read allows, list-item serializers, the name
// enrichment of the lists and OpenAPI schemas. Phase 4 runs without the treasurer role (D-030): fees, discounts,
// settings and charges are club-wide records the club administrator reads; `scopeWhere` with `club_admin` and no
// columns admits every row of the club to them and none to anyone else.
import { z } from 'zod'
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import type { GrantKind, ScopeColumnMap } from '@vereino/core'
import type { CampaignKpis } from '../lib/order-campaigns'
import { findActivities, findGroups, findPersons, type PaymentsScope } from '../services/directory'
import { campaignNames, campaignsKpis } from '../services/order-campaigns'

export const PAYMENTS_READ_KINDS: readonly GrantKind[] = ['club_admin']
export const CLUB_WIDE_COLUMNS: ScopeColumnMap = {}

/** Query-engine entity ids (`<module>:<snake_case class>`). */
export const FEE_ENTITY_ID = 'payments:fee'
export const DISCOUNT_RULE_ENTITY_ID = 'payments:discount_rule'
export const CHARGE_ENTITY_ID = 'payments:charge'

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const int = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}
const bool = (value: unknown): boolean => value === true || value === 't' || value === 'true'

function iso(value: unknown): string | null {
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

/** A calendar date column (`date`) as `YYYY-MM-DD`; the driver may hand back a string or a Date at midnight UTC. */
function calendarDate(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  return null
}

function json(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** The trusted scope of a list request, or null. */
export function listScope(ctx: CrudCtx): PaymentsScope | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  return tenantId && organizationId ? { tenantId, organizationId } : null
}

// --- Fees ---

export function feeListItem(row: Row) {
  return {
    id: String(row.id),
    name: text(row.name),
    amount: int(row.amount),
    period: text(row.period),
    groupId: text(row.group_id),
    activityId: text(row.activity_id),
    dueDay: int(row.due_day),
    validFrom: calendarDate(row.valid_from),
    validTo: calendarDate(row.valid_to),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type FeeListItem = ReturnType<typeof feeListItem> & { targetName?: string | null }

/** Adds the name of each fee's group or activity. */
export async function attachFeeTargets(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as FeeListItem[]
  const scope = listScope(ctx)
  if (items.length === 0 || !scope) return
  const groupIds = items.flatMap((item) => (item.groupId ? [item.groupId] : []))
  const activityIds = items.flatMap((item) => (item.activityId ? [item.activityId] : []))
  const [groups, activities] = await Promise.all([
    findGroups(ctx.container, scope, groupIds),
    findActivities(ctx.container, scope, activityIds),
  ])
  for (const item of items) {
    item.targetName = item.groupId
      ? (groups.get(item.groupId)?.name ?? null)
      : item.activityId
        ? (activities.get(item.activityId)?.name ?? null)
        : null
  }
}

export const feeListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  amount: z.number().int().nullable().describe('Grosz'),
  period: z.string().nullable(),
  groupId: z.string().nullable(),
  activityId: z.string().nullable(),
  targetName: z.string().nullable().optional().describe("The name of the fee's group or activity"),
  dueDay: z.number().int().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

// --- Discount rules ---

export function discountRuleListItem(row: Row) {
  const conditions = json(row.conditions)
  return {
    id: String(row.id),
    name: text(row.name),
    kind: text(row.kind),
    percent: int(row.percent),
    amount: int(row.amount),
    conditions: {
      feePeriods: Array.isArray(conditions.feePeriods) ? (conditions.feePeriods as string[]) : [],
      fullRate: text(conditions.fullRate),
      personIds: Array.isArray(conditions.personIds) ? (conditions.personIds as string[]) : [],
    },
    validFrom: calendarDate(row.valid_from),
    validTo: calendarDate(row.valid_to),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type DiscountRuleListItem = ReturnType<typeof discountRuleListItem> & {
  persons?: { id: string; firstName: string; lastName: string }[]
}

/** Adds the names of a custom rule's persons. */
export async function attachRulePersons(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as DiscountRuleListItem[]
  const scope = listScope(ctx)
  if (items.length === 0 || !scope) return
  const persons = await findPersons(
    ctx.container,
    scope,
    items.flatMap((item) => item.conditions.personIds),
  )
  for (const item of items) {
    item.persons = item.conditions.personIds.flatMap((id) => {
      const person = persons.get(id)
      return person ? [{ id, firstName: person.firstName, lastName: person.lastName }] : []
    })
  }
}

export const discountRuleListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  kind: z.string().nullable(),
  percent: z.number().int().nullable(),
  amount: z.number().int().nullable().describe('Grosz'),
  conditions: z.object({
    feePeriods: z.array(z.string()),
    fullRate: z.string().nullable(),
    personIds: z.array(z.string()),
  }),
  persons: z
    .array(z.object({ id: z.uuid(), firstName: z.string(), lastName: z.string() }))
    .optional()
    .describe("The names of a custom rule's persons"),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

// --- Charges ---

export function chargeListItem(row: Row) {
  const amount = int(row.amount) ?? 0
  const discountAmount = int(row.discount_amount) ?? 0
  return {
    id: String(row.id),
    sourceType: text(row.source_type),
    sourceId: text(row.source_id),
    personId: text(row.person_id),
    payerPersonId: text(row.payer_person_id),
    payerMissing: bool(row.payer_missing),
    periodLabel: text(row.period_label),
    description: text(row.description),
    amount,
    discountAmount,
    amountDue: amount - discountAmount,
    discountRuleId: text(row.discount_rule_id),
    dueDate: calendarDate(row.due_date),
    payee: text(row.payee),
    status: text(row.status),
    generationId: text(row.generation_id),
    cancelReason: text(row.cancel_reason),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

type PersonName = { firstName: string; lastName: string }

export type ChargeListItem = ReturnType<typeof chargeListItem> & {
  person?: PersonName | null
  payer?: PersonName | null
  discountRuleName?: string | null
  paid?: number
  remaining?: number
  overdue?: boolean
}

export const chargeListItemSchema = z.object({
  id: z.uuid(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable().describe('The fee of a `fee` charge'),
  personId: z.string().nullable(),
  person: z.object({ firstName: z.string(), lastName: z.string() }).nullable().optional(),
  payerPersonId: z.string().nullable(),
  payer: z.object({ firstName: z.string(), lastName: z.string() }).nullable().optional(),
  payerMissing: z.boolean(),
  periodLabel: z.string().nullable().describe('`YYYY-MM`, or `one_off`'),
  description: z.string().nullable(),
  amount: z.number().int().describe('Grosz, before the discount'),
  discountAmount: z.number().int(),
  amountDue: z.number().int(),
  discountRuleId: z.string().nullable(),
  discountRuleName: z.string().nullable().optional(),
  dueDate: z.string().nullable(),
  payee: z.string().nullable().describe('`club` or `owner_institution` (a municipality)'),
  status: z.string().nullable(),
  generationId: z.string().nullable(),
  cancelReason: z.string().nullable(),
  paid: z.number().int().optional().describe('Grosz paid so far (reversing entries included)'),
  remaining: z.number().int().optional().describe('Grosz still to pay'),
  overdue: z.boolean().optional().describe('`open` or `partially_paid` past the due date — a derived marker'),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

// --- Online checkout (#110) ---

export const checkoutSummarySchema = z.object({
  id: z.uuid(),
  status: z.string().describe('`created`, `completed`, `failed`, `expired`'),
  state: z.string().describe('M-09: `received`, `in_progress`, `interrupted`'),
  chargeIds: z.array(z.uuid()),
  amount: z.number().int(),
  feeAmount: z.number().int(),
  total: z.number().int(),
  amountMismatch: z.boolean(),
  createdAt: z.string(),
})

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const updateResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

// --- Order campaigns (#115) ---

export const ORDER_CAMPAIGN_ENTITY_ID = 'payments:order_campaign'

/** A `uuid[]` column as the query engine hands it back: an array, or the Postgres literal `{a,b}`. */
function uuidList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    const inner = value.replace(/^\{|\}$/g, '').trim()
    return inner ? inner.split(',').map((entry) => entry.replace(/"/g, '').trim()) : []
  }
  return []
}

export function orderCampaignListItem(row: Row) {
  return {
    id: String(row.id),
    name: text(row.name),
    sectionId: text(row.section_id),
    groupIds: uuidList(row.group_ids),
    closesOn: calendarDate(row.closes_on),
    paymentDueOn: calendarDate(row.payment_due_on),
    status: text(row.status),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type OrderCampaignListItem = ReturnType<typeof orderCampaignListItem> & {
  sectionName?: string | null
  groupNames?: string[]
  kpis?: CampaignKpis
}

/** Adds the section and group names and the KPIs of each listed campaign. */
export async function attachCampaignFacts(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as OrderCampaignListItem[]
  const scope = listScope(ctx)
  if (items.length === 0 || !scope) return
  const campaigns = items.map((item) => ({ id: item.id, sectionId: item.sectionId ?? '', groupIds: item.groupIds }))
  const [names, kpis] = await Promise.all([
    campaignNames(ctx.container, scope, campaigns),
    campaignsKpis(ctx.container, scope, campaigns),
  ])
  for (const item of items) {
    item.sectionName = item.sectionId ? (names.sections.get(item.sectionId) ?? null) : null
    item.groupNames = item.groupIds.flatMap((id) => {
      const name = names.groups.get(id)
      return name ? [name] : []
    })
    item.kpis = kpis.get(item.id)
  }
}

export const campaignKpisSchema = z.object({
  orders: z.number().int(),
  children: z.number().int().describe('Children of the campaign groups today'),
  missing: z.number().int().describe('Children without an order'),
  value: z.number().int().describe('Grosz due on the orders'),
  paid: z.number().int().describe('Grosz paid on the orders'),
  handedOver: z.number().int(),
})

export const orderCampaignListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  sectionId: z.string().nullable(),
  sectionName: z.string().nullable().optional(),
  groupIds: z.array(z.string()),
  groupNames: z.array(z.string()).optional(),
  closesOn: z.string().nullable(),
  paymentDueOn: z.string().nullable(),
  status: z.string().nullable().describe('`draft`, `open`, `closed`, `ordered`, `delivered`, `completed`'),
  kpis: campaignKpisSchema.optional(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})
