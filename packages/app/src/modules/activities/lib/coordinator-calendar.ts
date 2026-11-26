// The range rules of the coordinator calendar B-15 (`/backend/activities/occurrences?view=calendar`; calendar range
// switch spec REQ-W07, DD-W02, DD-W03, A-W02): Day / Week / Month on the shared switch and "Agenda" after them (the
// next 14 days from today, without arrows); the view, its day and the section filter live in the address
// (`&range=&date=&section=`), so a reload and a shared link reopen them. Without `range` a phone opens on Day and a
// wider screen on Week (the page sets the grid's week to start on Monday in every language, DD-W04). Pure: the page
// passes today and the width.
import { addCalendarDays, type CalendarDate, type DateWindow } from '@vereino/core'
import {
  calendarRangeHref,
  defaultCalendarRange,
  parseCalendarRange,
  rangeOf,
  type CalendarRange,
  type CalendarRangeParams,
} from '@vereino/ui'

export const AGENDA_VIEW = 'agenda'
/** How many days the agenda lists, today included. */
export const AGENDA_DAYS = 14

export type CoordinatorView = CalendarRange | typeof AGENDA_VIEW

export type CoordinatorCalendarState = { range: CoordinatorView; anchor: CalendarDate; sectionId: string | null }

/** The view, its day and the section of the address. */
export function coordinatorCalendarState(
  params: CalendarRangeParams,
  wide: boolean,
  today: CalendarDate,
): CoordinatorCalendarState {
  const parsed = parseCalendarRange(params, { today, fallback: defaultCalendarRange(wide), extra: [AGENDA_VIEW] })
  return { range: parsed.range, anchor: parsed.anchor, sectionId: params.get('section') || null }
}

/** The dates the grid shows: the day, the Monday–Sunday week, the month, or the agenda's 14 days from today. */
export function coordinatorGridDates(view: CoordinatorView, anchor: CalendarDate, today: CalendarDate): DateWindow {
  if (view === AGENDA_VIEW) return { from: today, to: addCalendarDays(today, AGENDA_DAYS - 1) }
  return rangeOf(view, anchor)
}

/** The dates the calendar reads: exactly the grid's. */
export function coordinatorReadWindow(view: CoordinatorView, anchor: CalendarDate, today: CalendarDate): DateWindow {
  return coordinatorGridDates(view, anchor, today)
}

/** The address of a view: the page's other parameters (`view=calendar`, `activity`) kept, the section set or dropped. */
export function coordinatorCalendarHref(
  path: string,
  current: string | { toString(): string },
  view: string,
  anchor: CalendarDate,
  sectionId?: string | null,
): string {
  const href = calendarRangeHref(path, current, view, anchor)
  if (sectionId === undefined) return href
  const [base, query] = href.split('?')
  const params = new URLSearchParams(query)
  if (sectionId) params.set('section', sectionId)
  else params.delete('section')
  return `${base}?${params.toString()}`
}
