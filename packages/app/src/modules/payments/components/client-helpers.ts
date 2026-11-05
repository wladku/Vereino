// Small client-side helpers shared by the `payments` backend pages (B-20, B-21; issue #108): row types as the API
// returns them, links, money in grosz, option loaders and error text. Authorization stays on the routes and commands.
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import type { DataTableProps } from '@open-mercato/ui/backend/DataTable'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import type { useT } from '@open-mercato/shared/lib/i18n/context'

export type Translate = ReturnType<typeof useT>

/** The column definitions `DataTable` takes for rows of type `T`. */
export type TableColumns<T extends object> = DataTableProps<T>['columns']

export const FEES_HREF = '/backend/payments/fees'
export const DISCOUNTS_HREF = '/backend/payments/discounts'
export const PAYMENT_SETTINGS_HREF = '/backend/payments/settings'
export const CHARGES_HREF = '/backend/payments/charges'

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
  periodLabel: string | null
  description: string | null
  amount: number
  discountAmount: number
  amountDue: number
  discountRuleId: string | null
  discountRuleName?: string | null
  dueDate: string | null
  status: string | null
  generationId: string | null
  updatedAt: string | null
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

/** Today's local month (`YYYY-MM`), the period the generation dialog proposes. */
export function localMonth(): string {
  const now = new Date()
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Today's local calendar date (`YYYY-MM-DD`), the default validity start the forms propose. */
export function localToday(): string {
  const now = new Date()
  return `${localMonth()}-${String(now.getDate()).padStart(2, '0')}`
}

/** The club's active groups, by name (the fee form's group field). */
export async function groupOptions(): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<{ id: string; name: string | null; sectionName?: string | null }>('groups/groups', {
    pageSize: 100,
    sortField: 'name',
    sortDir: 'asc',
    isActive: 'true',
  })
  return data.items.map((item) => ({
    value: item.id,
    label: item.sectionName ? `${item.name ?? item.id} — ${item.sectionName}` : (item.name ?? item.id),
  }))
}

/** The club's activities, by name (the fee form's activity field; a camp is an activity). */
export async function activityOptions(): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<{ id: string; name: string | null }>('activities/activities', {
    pageSize: 100,
    sortField: 'name',
    sortDir: 'asc',
  })
  return data.items.map((item) => ({ value: item.id, label: item.name ?? item.id }))
}

/** The club's persons, filtered by the typed last name (the custom discount rule's persons). */
export async function personOptions(query?: string): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<{ id: string; firstName?: string | null; lastName?: string | null }>(
    'people/persons',
    { pageSize: 50, ...(query ? { lastName: query } : {}) },
  )
  return data.items.map((item) => ({
    value: item.id,
    label: personName({ firstName: item.firstName ?? '', lastName: item.lastName ?? '' }) || item.id,
  }))
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
