// Client-side types and helpers of the bulk import pages (#28): rows as `/api/people/imports/**` returns them, the
// field and classification labels, and the error code of a failed call. Authorization stays on the routes.
import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import type { ImportPersonField, ImportSlot } from '../../lib/import-mapping'
import type { Translate } from '../client-helpers'

export const IMPORTS_HREF = '/backend/people/imports'

export type ImportStatus = 'previewed' | 'committed' | 'cancelled'
export type ImportClassification = 'new' | 'matched' | 'review' | 'error'
export type ImportDecisionAction = 'match' | 'create' | 'skip'

export type PersonRefRow = { personId: string; name: string | null }

export type ImportSummaryRow = Partial<
  Record<ImportClassification | 'created' | 'updated' | 'linked' | 'skipped' | 'membershipsPending', number>
>

export type ImportRow = {
  id: string
  status: ImportStatus
  fileFormat: 'csv' | 'xlsx'
  rowCount: number
  summary: ImportSummaryRow
  header: string[]
  mapping: Record<string, number | undefined>
  createdBy: PersonRefRow
  committedBy: PersonRefRow | null
  createdAt: string
  committedAt: string | null
  cancelledAt: string | null
  purgedAt: string | null
  fileAvailable: boolean
  pendingDecisions: number
  updatedAt: string
}

export type ImportPersonValuesRow = Record<ImportPersonField, string | null>

export type ImportRowRow = {
  id: string
  rowNo: number
  classification: ImportClassification
  decision: ImportDecisionAction | null
  decisionPerson: PersonRefRow | null
  matchedPerson: PersonRefRow | null
  errorCode: string | null
  errorColumn: string | null
  reviewReason: string | null
  needsDecision: boolean
  groupName: string | null
  membershipStatus: string | null
  committedAt: string | null
  values: { persons: Partial<Record<ImportSlot, ImportPersonValuesRow>>; group: string | null } | null
  updatedAt: string
}

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number }

export const STATUS_VARIANTS: Record<ImportStatus, StatusBadgeVariant> = {
  previewed: 'info',
  committed: 'success',
  cancelled: 'neutral',
}

export const CLASSIFICATION_VARIANTS: Record<ImportClassification, StatusBadgeVariant> = {
  new: 'info',
  matched: 'success',
  review: 'warning',
  error: 'error',
}

export const CLASSIFICATIONS: readonly ImportClassification[] = ['new', 'matched', 'review', 'error']

export function valuesName(values: ImportPersonValuesRow | undefined): string {
  return [values?.firstName, values?.lastName].filter(Boolean).join(' ')
}

/** A date-time in the reader's locale. */
export function instantLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString() : ''
}

export function codeOf(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

/** The translated text of a row problem or review reason (codes declared in `lib/import-rules.ts`). */
export function rowProblem(t: Translate, row: ImportRowRow): string | null {
  if (row.errorCode) {
    const text = t(`people.imports.rowErrors.${row.errorCode}`)
    return row.errorColumn ? t('people.imports.rows.problemInColumn', { problem: text, column: row.errorColumn }) : text
  }
  if (row.reviewReason) return t(`people.imports.reviewReasons.${row.reviewReason}`)
  return null
}
