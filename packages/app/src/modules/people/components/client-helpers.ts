// Small client-side helpers shared by the `people` backend pages: row types as the API returns them, names, periods
// and text normalization. Authorization stays on the routes and commands.
import type { DataTableProps } from '@open-mercato/ui/backend/DataTable'
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import { endsBefore, isActiveAt } from '@vereino/core'

export type Translate = ReturnType<typeof useT>

/** The column definitions `DataTable` takes for rows of type `T`. */
export type TableColumns<T extends object> = DataTableProps<T>['columns']

export const PERSONS_HREF = '/backend/people/persons'

export type PersonListRow = {
  id: string
  firstName: string | null
  lastName: string | null
  preferredLocale: string | null
  birthDate: string | null
  hasAccount: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** `GET /api/people/persons/{id}`: `access: 'basic'` (a coordinator) carries no contact details, notes or PESEL. */
export type PersonDetail = PersonListRow & {
  access: 'basic' | 'full'
  email?: string | null
  phone?: string | null
  notes?: string | null
  userId?: string | null
  pesel?: string | null
}

export type ConsentKind = 'regulations' | 'image' | 'trips'
export const CONSENT_KINDS: readonly ConsentKind[] = ['regulations', 'image', 'trips']
export type ConsentViewRow = { granted: boolean; at: string | null; byPersonId: string | null }

export const GUARDIAN_RELATIONS = ['parent', 'grandparent', 'legal_guardian', 'other'] as const

export type GuardianshipRow = {
  id: string
  guardianPersonId: string
  wardPersonId: string
  relation: string
  isPrimaryPayer: boolean
  validFrom: string | null
  validTo: string | null
  /** Present only for the club administrator and a guardian of the ward. */
  consents?: Record<ConsentKind, ConsentViewRow>
  updatedAt: string | null
}

export type RoleAssignmentRow = {
  id: string
  personId: string
  role: string
  sectionId: string | null
  validFrom: string | null
  validTo: string | null
  updatedAt: string | null
}

/** A trimmed text field value, or null when blank (explicit clearing, S6.3). */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function personName(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ')
}

/** Today's local calendar date (`YYYY-MM-DD`), the default start or end day the forms propose. */
export function localToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export type PeriodStatus = 'active' | 'ended' | 'upcoming'

/** Whether a period is active, ended or still to start on `today` (the server decides with the club zone). */
export function periodStatus(validFrom: string | null, validTo: string | null, today: string): PeriodStatus {
  if (!validFrom) return 'active'
  const period = { validFrom, validTo }
  if (isActiveAt(period, today)) return 'active'
  return endsBefore(period, today) ? 'ended' : 'upcoming'
}

export function periodLabel(t: Translate, validFrom: string | null, validTo: string | null): string {
  if (!validFrom) return t('people.common.empty')
  return validTo
    ? t('people.common.period.closed', { from: validFrom, to: validTo })
    : t('people.common.period.open', { from: validFrom })
}
