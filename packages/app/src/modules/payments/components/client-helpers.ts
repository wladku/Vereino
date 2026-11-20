// Small client-side helpers shared by the `payments` backend pages (B-20, B-21, B-22; issues #108, #109): row types as the API
// returns them, links, money in grosz, option loaders and error text. Authorization stays on the routes and commands.
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import type { DataTableProps } from '@open-mercato/ui/backend/DataTable'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import type { PaymentSource } from '../lib/charge-ledger'

export type Translate = ReturnType<typeof useT>

/** The column definitions `DataTable` takes for rows of type `T`. */
export type TableColumns<T extends object> = DataTableProps<T>['columns']

export const FEES_HREF = '/backend/payments/fees'
export const DISCOUNTS_HREF = '/backend/payments/discounts'
export const PAYMENT_SETTINGS_HREF = '/backend/payments/settings'
export const CHARGES_HREF = '/backend/payments/charges'
export const BANK_HREF = '/backend/payments/bank'
export const GENERATIONS_HREF = '/backend/payments/generations'

export function chargeHref(id: string): string {
  return `${CHARGES_HREF}/${encodeURIComponent(id)}`
}

/** The guardianship tab of a person's record (B-10), where a primary payer is chosen (#295). */
export function personGuardianshipHref(personId: string): string {
  return `/backend/people/persons/${encodeURIComponent(personId)}?tab=guardianship`
}

export type FeeRow = {
  id: string
  name: string | null
  amount: number | null
  period: string | null
  groupId: string | null
  activityId: string | null
  targetName?: string | null
  dueDay: number | null
  validFrom: string | null
  validTo: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type DiscountRuleRow = {
  id: string
  name: string | null
  kind: string | null
  percent: number | null
  amount: number | null
  conditions: { feePeriods: string[]; fullRate: string | null; personIds: string[] }
  persons?: { id: string; firstName: string; lastName: string }[]
  validFrom: string | null
  validTo: string | null
  createdAt: string | null
  updatedAt: string | null
}

type PersonName = { firstName: string; lastName: string }

export type ChargeRow = {
  id: string
  sourceType: string | null
  personId: string | null
  person?: PersonName | null
  payerPersonId: string | null
  payer?: PersonName | null
  payerMissing: boolean
  payerInstitutionId?: string | null
  payerInstitution?: { id: string; name: string } | null
  payeeInstitutionId?: string | null
  payeeInstitution?: { id: string; name: string } | null
  payerLabel?: string | null
  periodLabel: string | null
  description: string | null
  amount: number
  discountAmount: number
  amountDue: number
  discountRuleId: string | null
  discountRuleName?: string | null
  dueDate: string | null
  payee: string | null
  status: string | null
  generationId: string | null
  cancelReason: string | null
  paid?: number
  remaining?: number
  overdue?: boolean
  updatedAt: string | null
}

export type PaymentRow = {
  id: string
  amount: number
  method: string
  paidOn: string
  reference: string | null
  receivedBy: PersonName | null
  /** Where the payment came from; "bank statement" is read as its receiver on B-22 (#292). */
  source: PaymentSource
  reversesPaymentId: string | null
  reversed: boolean
  /** An online share whose charge was no longer open: money to refund (Q-049). */
  overpayment: boolean
  /** Grosz still refundable through the gateway; 0 for anything but an online payment (#296). */
  refundable: number
  refunds: RefundRow[]
  createdAt: string
}

/** One refund of an online payment (B-22, #296). */
export type RefundRow = {
  id: string
  amount: number
  paidOn: string
  reason: string | null
  gatewayRefundId: string | null
}

/** A person who may pay a charge without a payer (B-22 "Assign payer", #295). */
export type PayerOption = { id: string; firstName: string; lastName: string }

export type ChargeDetail = ChargeRow & {
  payerOptions: PayerOption[]
  paid: number
  remaining: number
  overdue: boolean
  payments: PaymentRow[]
}

export type GenerationSummary = {
  generationId: string
  period: string
  created: number
  skipped: number
  payerMissing: number
}

type CodedError = { code?: unknown; status?: unknown }

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as CodedError).code
  return typeof code === 'string' ? code : null
}

export function personName(person: PersonName | null | undefined): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ')
}

/** An amount in grosz as PLN in the user's locale. */
export function formatMoney(grosz: number | null | undefined, locale: string): string {
  if (typeof grosz !== 'number') return ''
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'PLN' }).format(grosz / 100)
}

/** A PLN amount typed in a form (`150`, `150,50`, `150.5`) as whole grosz, or null when it is not a number. */
export function toGrosz(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d+([.,]\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text.replace(',', '.')) * 100)
}

/** Grosz as the PLN text a form field shows (`15000` → `150`, `15050` → `150.50`). */
export function fromGrosz(grosz: number | null | undefined): string {
  if (typeof grosz !== 'number') return ''
  return grosz % 100 === 0 ? String(grosz / 100) : (grosz / 100).toFixed(2)
}

export type LookupRow = { id: string; label: string; sectionId: string | null; sectionName: string | null }

/**
 * The names a Finance form offers, read through `payments` (`GET /api/payments/lookups`, #245): the treasurer holds
 * no feature of the modules that own groups, activities, sections and persons.
 */
export async function lookupRows(
  kind: 'groups' | 'activities' | 'sections' | 'persons',
  params: { search?: string; sectionId?: string; ids?: readonly string[]; pageSize?: number } = {},
): Promise<LookupRow[]> {
  const query = new URLSearchParams({ kind, pageSize: String(params.pageSize ?? 100) })
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.sectionId) query.set('sectionId', params.sectionId)
  if (params.ids && params.ids.length > 0) query.set('ids', params.ids.join(','))
  const data = await readApiResultOrThrow<{ items?: LookupRow[] }>(`/api/payments/lookups?${query.toString()}`)
  return data.items ?? []
}

/** The club's active groups, by name (the fee form's group field). */
export async function groupOptions(): Promise<CrudFieldOption[]> {
  const rows = await lookupRows('groups')
  return rows.map((item) => ({
    value: item.id,
    label: item.sectionName ? `${item.label} — ${item.sectionName}` : item.label,
  }))
}

/** The club's activities, by name (the fee form's activity field; a camp is an activity). */
export async function activityOptions(): Promise<CrudFieldOption[]> {
  const rows = await lookupRows('activities')
  return rows.map((item) => ({ value: item.id, label: item.label }))
}

/**
 * The club's persons (the custom discount rule's persons, the manual charge's person): those matching the typed name
 * (three letters or more), else the persons the club already charges.
 */
export async function personOptions(query?: string): Promise<CrudFieldOption[]> {
  const rows = await lookupRows('persons', { search: query, pageSize: 50 })
  return rows.map((item) => ({ value: item.id, label: item.label }))
}

/** The label of one person (a saved selection outside the offered persons). */
export async function personLabelOf(id: string): Promise<string> {
  const [row] = await lookupRows('persons', { ids: [id], pageSize: 1 })
  return row?.label ?? id
}

/** An option loader that offers nothing instead of failing. */
export function tolerant(load: (query?: string) => Promise<CrudFieldOption[]>) {
  return async (query?: string): Promise<CrudFieldOption[]> => {
    try {
      return await load(query)
    } catch {
      return []
    }
  }
}
