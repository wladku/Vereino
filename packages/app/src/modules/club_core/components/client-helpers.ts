// Small client-side helpers shared by the `club_core` backend forms and tables.
import type { DataTableProps } from '@open-mercato/ui/backend/DataTable'
import type { useT } from '@open-mercato/shared/lib/i18n/context'

export type Translate = ReturnType<typeof useT>

/** The column definitions `DataTable` takes for rows of type `T`. */
export type TableColumns<T extends object> = DataTableProps<T>['columns']

/** A trimmed text field value, or null when blank (explicit clearing, S6.3). */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** A number field value (the input may report a string), or null when blank or not a number. */
export function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** `{ value, label }` options of an enum, labelled from `<prefix>.<value>` catalog keys. */
export function enumOptions(values: readonly string[], prefix: string, t: Translate) {
  return values.map((value) => ({ value, label: t(`${prefix}.${value}`) }))
}
