// The section coordinator's sessions on the phone (groups and activities parity spec, phase 8, REQ-A10, D-031 §3;
// E10-S08 #273): which calendar a staff person sees ("My sessions" as the coach, "Section" as the coordinator, or a
// switch between both), the view chips of the section calendar (All / Needing a coach / Needs a new time / Unsettled /
// Cancelled) kept in the URL (`/club/calendar?as=coordinator&view=…&section=…`), and the list read a view and the Today
// counts make (`GET /api/activities/occurrences` with the view query of the panel's sessions list). Pure: the pages pass
// the profile's staff scopes, the URL and "today".
import type { CalendarDate } from '@vereino/core'
import { perspectiveQuery, perspectiveWindow } from './occurrence-list'

export const SECTION_VIEWS = ['all', 'unassigned', 'reschedule', 'unsettled', 'cancelled'] as const

export type SectionView = (typeof SECTION_VIEWS)[number]

/** The views a list read serves: every view but "All", which is the section's calendar week. */
export type SectionListView = Exclude<SectionView, 'all'>

/** The three counts of the Today tile "Section sessions" (M-02), in the order the tile shows them. */
export const SECTION_COUNT_VIEWS = [
  'unassigned',
  'reschedule',
  'unsettled',
] as const satisfies readonly SectionListView[]

/** The view a `?view=` value names; anything else is "All". */
export function sectionViewOf(value: string | null | undefined): SectionView {
  return (SECTION_VIEWS as readonly string[]).includes(value ?? '') ? (value as SectionView) : 'all'
}

export type StaffCalendarMode = 'mine' | 'section'

export type StaffCalendarChoice = { mode: StaffCalendarMode; switcher: boolean }

/**
 * The calendar a person sees (phase 8): the section view only in the staff context with the `coordinator` scope — on
 * its own for a coordinator who does not coach, and behind the "My sessions / Section" switch (`?as=coordinator` picks
 * "Section", "My sessions" is the default) for one who also coaches. The member context never shows it.
 */
export function staffCalendarChoice(
  requested: string | null,
  context: { staff: boolean; scopes: readonly string[] },
): StaffCalendarChoice {
  if (!context.staff || !context.scopes.includes('coordinator')) return { mode: 'mine', switcher: false }
  if (!context.scopes.includes('coach')) return { mode: 'section', switcher: false }
  return { mode: requested === 'coordinator' ? 'section' : 'mine', switcher: true }
}

export const CLUB_CALENDAR_PATH = '/club/calendar'

/** The section calendar URL of a view, optionally narrowed to one section ("All" keeps no `view`). */
export function sectionCalendarHref(view: SectionView, sectionId?: string | null): string {
  const params = new URLSearchParams({ as: 'coordinator' })
  if (view !== 'all') params.set('view', view)
  if (sectionId) params.set('section', sectionId)
  return `${CLUB_CALENDAR_PATH}?${params.toString()}`
}

/** The most sessions one view lists on the phone; the panel's sessions list pages through more. */
export const SECTION_LIST_PAGE_SIZE = 100

/**
 * The read of a view: the panel list's query for it (`unassigned=1`, planned with `needsReschedule`, `unsettled=1`,
 * cancelled) and its default window, by start time; `pageSize` 1 reads only the count (`total`) for the Today tile.
 */
export function sectionSessionsUrl(
  view: SectionListView,
  today: CalendarDate,
  options: { sectionId?: string | null; pageSize?: number } = {},
): string {
  const params = new URLSearchParams(perspectiveQuery(view))
  const window = perspectiveWindow(view, today)
  if (window) {
    params.set('from', window.from)
    params.set('to', window.to)
  }
  if (options.sectionId) params.set('sectionId', options.sectionId)
  params.set('sortField', 'startAt')
  params.set('sortDir', 'asc')
  params.set('pageSize', String(options.pageSize ?? SECTION_LIST_PAGE_SIZE))
  return `/api/activities/occurrences?${params.toString()}`
}
