// The opening-hours rule for a one-off event on a club place (facilities parity spec REQ-R19, DD-R15; #288): the event
// lies inside one opening window of its day in the club time zone. The hours are the place's own or inherited
// (`clubCorePlaces.openingHours`, DD-41); no hours on the place chain means no limit, a date no season covers is
// closed, and an event that runs past midnight never fits (as a club booking, facilities `slotWithinOpeningHours`).
// Recurring series are not checked (DD-R15). Pure, so the command and its tests share one rule.
import { minutesOfDay, openingWindowsOn, type OpeningHours, type WallTime } from '@vereino/core'
import { localDateTime } from './activities-rules'

/** One opening window of the event's day, as the 409 `event_place_closed` lists it. */
export type OpeningWindowView = { readonly from: WallTime; readonly to: WallTime }

const MINUTE_MS = 60_000
const DAY_MINUTES = 24 * 60

/**
 * The opening windows of the event's day when the event does not fit them (409 `event_place_closed`), `[]` for a
 * closed day; null when the event fits or the place has no opening hours.
 */
export function eventOutsideOpeningHours(
  hours: OpeningHours | null,
  startAt: Date,
  endAt: Date,
  timeZone: string,
): OpeningWindowView[] | null {
  const start = localDateTime(startAt, timeZone)
  const windows = openingWindowsOn(hours, start.date)
  if (windows === null) return null
  const from = minutesOfDay(start.time)
  const to = from + (endAt.getTime() - startAt.getTime()) / MINUTE_MS
  const fits =
    to <= DAY_MINUTES && windows.some((window) => minutesOfDay(window.from) <= from && to <= minutesOfDay(window.to))
  if (fits) return null
  return windows
    .map((window) => ({ from: window.from, to: window.to }))
    .sort((a, b) => minutesOfDay(a.from) - minutesOfDay(b.from))
}

/** The windows as one line for the error message, e.g. `08:00–12:00, 14:00–22:00`; `—` for a closed day. */
export function openingLine(windows: readonly OpeningWindowView[]): string {
  return windows.length === 0 ? '—' : windows.map((window) => `${window.from}–${window.to}`).join(', ')
}
