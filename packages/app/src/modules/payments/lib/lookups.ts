// The option lists of the Finance forms (payments spec DD-33, #245): the fee's group or activity, the order campaign's
// section and groups, the custom discount's and the manual charge's person. The treasurer holds no `groups.*`,
// `activities.*`, `people.*` or `club_core.*` feature, so the forms read these names through `payments` itself
// (`GET /api/payments/lookups`) instead of the owning modules' lists. Pure shaping: matching, ordering and paging.

export const LOOKUP_KINDS = ['groups', 'activities', 'sections', 'persons'] as const
export type LookupKind = (typeof LOOKUP_KINDS)[number]

export type LookupItem = { id: string; label: string; sectionId: string | null; sectionName: string | null }

export type LookupPage = {
  items: LookupItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** The case- and accent-insensitive form of a text the lookups compare. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .trim()
}

/** Whether `label` contains every word of `search`; an empty search matches everything. */
export function matchesSearch(label: string, search: string | undefined): boolean {
  const words = foldText(search ?? '')
    .split(/\s+/)
    .filter((word) => word.length > 0)
  const folded = foldText(label)
  return words.every((word) => folded.includes(word))
}

/** A person's option label, "First Last", or the id when both names are empty. */
export function personLabel(person: { id: string; firstName: string; lastName: string }): string {
  return [person.firstName, person.lastName].filter((part) => part.trim().length > 0).join(' ') || person.id
}

/**
 * The page of the items matching `search`, ordered by label (Polish collation) — the S6.4 list shape. `search` is
 * applied here for the names `payments` reads whole (groups, activities, sections); persons arrive already narrowed by
 * the people directory's name index.
 */
export function lookupPage(
  items: readonly LookupItem[],
  query: { search?: string; page: number; pageSize: number },
): LookupPage {
  const collator = new Intl.Collator('pl', { sensitivity: 'base' })
  const matching = items
    .filter((item) => matchesSearch(item.label, query.search))
    .sort((a, b) => collator.compare(a.label, b.label) || a.id.localeCompare(b.id))
  const start = (query.page - 1) * query.pageSize
  return {
    items: matching.slice(start, start + query.pageSize),
    total: matching.length,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(matching.length / query.pageSize)),
  }
}
