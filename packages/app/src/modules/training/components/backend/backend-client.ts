// The HTTP side of the `training` back-office pages (training outlines spec *UI architecture*, M-O5; #847): the list
// route's query from the table's filters, the record route of one outline and the module's coded errors as messages.
// Authorization stays on the routes and commands.
import type { DataTableProps } from '@open-mercato/ui/backend/DataTable'
import type { FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { errorCodeOf } from '@vereino/core'
import { errorCodes } from '../../lib/error-codes'
import { OUTLINE_PARTS } from '../../lib/outline'
import type { OutlineListItem } from '../club/club-client'

export type Translate = (key: string, params?: Record<string, string | number>) => string

export type OutlineTableColumns = DataTableProps<OutlineListItem>['columns']

/** `fetchCrudList` and the CRUD helpers prefix `/api/`. */
export const BACKEND_OUTLINES_API = 'training/outlines'

export const BACKEND_OUTLINES_HREF = '/backend/training/outlines'

export function backendOutlineHref(id: string): string {
  return `${BACKEND_OUTLINES_HREF}/${encodeURIComponent(id)}`
}

const VIEWS = new Set(['mine', 'sessions', 'series'])
const PARTS = new Set<string>(OUTLINE_PARTS)

/** The list route's filters from the table's filter values and search; an empty object when nothing narrows it. */
export function outlineListParams(values: FilterValues, search: string): Record<string, string> {
  const params: Record<string, string> = {}
  const view: unknown = values.view
  if (typeof view === 'string' && VIEWS.has(view)) params.view = view
  const ageCategory: unknown = values.ageCategory
  if (typeof ageCategory === 'string' && ageCategory.trim()) params.ageCategory = ageCategory.trim()
  const part: unknown = values.part
  if (typeof part === 'string' && PARTS.has(part)) params.part = part
  if (search.trim()) params.search = search.trim()
  return params
}

const MESSAGE_OF = new Map<string, string>(errorCodes.map((entry) => [entry.code, entry.messageKey]))

/** The catalog message of one of this module's coded errors; null for any other error. */
export function outlineCodedMessage(error: unknown, t: Translate): string | null {
  const code = errorCodeOf(error)
  const key = code ? MESSAGE_OF.get(code) : undefined
  return key ? t(key) : null
}

/** A coded error's message, else the fallback key's text. */
export function outlineErrorMessage(error: unknown, t: Translate, fallbackKey: string): string {
  return outlineCodedMessage(error, t) ?? t(fallbackKey)
}
