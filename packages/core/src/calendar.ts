// P-23 calendars (foundation II DD-G08): one `CalendarItem` type shared by every calendar surface — the member
// list (`CalendarList` in `@vereino/ui`), the coordinator's `ScheduleView` (through `toScheduleItem`) and later the
// public schedule block — plus the day bucketing and the week ranges the member toolbar moves through. Nothing here
// knows sessions or declarations: a module maps its rows to items and reads the buckets back.
import { calendarDateInZone, type CalendarDate } from '#src/calendar-date'
import { addCalendarDays, calendarDaysBetween, mondayOf, type DateWindow } from '#src/recurrence'

/** The status tone of an item: `planned` neutral, `done` muted, `cancelled` with the error tone (DD-G08). */
export type CalendarItemStatus = 'planned' | 'done' | 'cancelled'

export type CalendarBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'

/** A short status shown next to the item (a declaration state, "Moved", …). */
export type CalendarItemBadge = {
  readonly id: string
  readonly label: string
  readonly tone: CalendarBadgeTone
}

/** An action a calendar surface offers on the item; the module decides what the id means. */
export type CalendarItemAction = {
  readonly id: string
  readonly label: string
  readonly tone?: 'default' | 'primary' | 'destructive'
  readonly disabled?: boolean
}

export type CalendarItem = {
  readonly id: string
  readonly title: string
  readonly startsAt: Date
  readonly endsAt: Date
  readonly status: CalendarItemStatus
  /** The place's name, and its address when the surface shows one (D21: "an address without a map pin cost 30 minutes"). */
  readonly place?: string | null
  readonly placeAddress?: string | null
  readonly group?: string | null
  /** A second line under the title — the wards the item concerns, the coach, … */
  readonly subtitle?: string | null
  readonly href?: string | null
  readonly badges?: readonly CalendarItemBadge[]
  readonly actions?: readonly CalendarItemAction[]
}

/** One day of a calendar list: the club-zone date and its items, in start order. */
export type CalendarDay = {
  readonly date: CalendarDate
  readonly items: readonly CalendarItem[]
}

function isInstant(value: Date): boolean {
  return !Number.isNaN(value.getTime())
}

/** True when both instants are valid and the item starts before it ends (an item with `startsAt ≥ endsAt` is dropped). */
export function isValidCalendarItem(item: Pick<CalendarItem, 'startsAt' | 'endsAt'>): boolean {
  return isInstant(item.startsAt) && isInstant(item.endsAt) && item.startsAt.getTime() < item.endsAt.getTime()
}

/** The items that render, in start order (then by title); invalid items are left out and returned apart. */
export function validCalendarItems<T extends CalendarItem>(items: readonly T[]): { items: T[]; dropped: T[] } {
  const valid: T[] = []
  const dropped: T[] = []
  for (const item of items) (isValidCalendarItem(item) ? valid : dropped).push(item)
  valid.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.title.localeCompare(b.title))
  return { items: valid, dropped }
}

/**
 * Buckets the valid items by the club-zone date of their start, oldest day first (DD-G08: "day headers in the club
 * zone"). A multi-day item appears under its first day only.
 */
export function groupCalendarItemsByDay(items: readonly CalendarItem[], timeZone: string): CalendarDay[] {
  const byDay = new Map<CalendarDate, CalendarItem[]>()
  for (const item of validCalendarItems(items).items) {
    const date = calendarDateInZone(item.startsAt, timeZone)
    const day = byDay.get(date) ?? []
    day.push(item)
    byDay.set(date, day)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayItems]) => ({ date, items: dayItems }))
}

/** The longest range a calendar read serves (club spec API table: 400 beyond 62 days). */
export const CALENDAR_RANGE_MAX_DAYS = 62

/** Days in the inclusive range, or null when `to` precedes `from`. */
export function calendarRangeDays(window: DateWindow): number | null {
  const days = calendarDaysBetween(window.from, window.to) + 1
  return days < 1 ? null : days
}

/** True for a range the calendar serves: ordered and at most `CALENDAR_RANGE_MAX_DAYS` long. */
export function isServedCalendarRange(window: DateWindow): boolean {
  const days = calendarRangeDays(window)
  return days !== null && days <= CALENDAR_RANGE_MAX_DAYS
}

/**
 * The Monday–Sunday week `offsetWeeks` weeks away from the week of `today` (the member toolbar's "this week",
 * "next week", prev and next).
 */
export function calendarWeek(today: CalendarDate, offsetWeeks = 0): DateWindow {
  const from = addCalendarDays(mondayOf(today), offsetWeeks * 7)
  return { from, to: addCalendarDays(from, 6) }
}

/** Today and tomorrow in the club zone — the window of the "Today" tiles. */
export function calendarTodayAndTomorrow(today: CalendarDate): DateWindow {
  return { from: today, to: addCalendarDays(today, 1) }
}
