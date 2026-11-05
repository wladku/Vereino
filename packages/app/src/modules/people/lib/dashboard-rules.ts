// Pure rules of the `people` dashboard widgets (README B-01, note 4; issue #88). "Sections without a coordinator"
// reads the section list of `/api/club_core/sections` with the `people.section-coordinators` enrichment
// (`_people.coordinatorMissing`: an active section without an active coordinator today) and shows the count and the
// first sections by name, each linking to the section's Coordinators tab.

/** How many sections the widget lists; the count covers all of them. */
export const SECTIONS_WITHOUT_COORDINATOR_LIMIT = 5

/** The page size the widget reads the section list with (the route's maximum). */
export const SECTION_PAGE_SIZE = 100

export type SectionWithoutCoordinator = { id: string; name: string }

export type SectionsWithoutCoordinator = { total: number; sections: SectionWithoutCoordinator[] }

/** The sections of a list page that are active and have no active coordinator, in the order given. */
export function sectionsMissingCoordinator(items: readonly unknown[]): SectionWithoutCoordinator[] {
  const result: SectionWithoutCoordinator[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const { id, name, isActive, _people } = item as {
      id?: unknown
      name?: unknown
      isActive?: unknown
      _people?: { coordinatorMissing?: unknown } | null
    }
    if (typeof id !== 'string' || isActive === false || _people?.coordinatorMissing !== true) continue
    result.push({ id, name: typeof name === 'string' ? name : '' })
  }
  return result
}

/** The count of all the sections and the first `limit` of them by name (locale-aware, case-insensitive). */
export function summarizeSectionsWithoutCoordinator(
  sections: readonly SectionWithoutCoordinator[],
  limit: number = SECTIONS_WITHOUT_COORDINATOR_LIMIT,
): SectionsWithoutCoordinator {
  const sorted = [...sections].sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id),
  )
  return { total: sections.length, sections: sorted.slice(0, Math.max(0, limit)) }
}

/** The query of one page of the active sections the widget reads. */
export function sectionListQuery(page: number): string {
  return new URLSearchParams({
    page: String(page),
    pageSize: String(SECTION_PAGE_SIZE),
    isActive: 'true',
    sortField: 'name',
    sortDir: 'asc',
  }).toString()
}

/** True while the list has another page after `page` (`totalPages` from the list response). */
export function hasNextPage(page: number, totalPages: unknown): boolean {
  return typeof totalPages === 'number' && Number.isFinite(totalPages) && page < totalPages
}

/** The section page opened on its Coordinators tab (UX parity spec REQ-U02, `?tab=coordinators`). */
export function sectionCoordinatorsHref(sectionId: string): string {
  return `/backend/club/sections/${encodeURIComponent(sectionId)}/edit?tab=coordinators`
}

export const SECTIONS_LIST_HREF = '/backend/club/sections'
