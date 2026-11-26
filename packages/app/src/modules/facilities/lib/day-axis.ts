// The pure layout of the day axis (facilities parity spec DD-R01, DD-R02, REQ-R01; #276): one club-zone day of one
// place on an hour axis. All times are minutes after the day's midnight in the club's zone (0–1440); the component
// converts the calendar's instants before it calls these helpers. Pure and framework-free.
import { addDays, type CalendarDate, type IsoWeekday } from '@vereino/core'
import type { Zone, ZoneSource } from './zones'

/** A stretch of the day in minutes after midnight (`from` inclusive, `to` exclusive). */
export type Span = { from: number; to: number }

/** The axis's default range, 08:00–22:00 (DD-R02). */
export const AXIS_START = 8 * 60
export const AXIS_END = 22 * 60
export const DAY_MINUTES = 24 * 60
const HOUR = 60

/** The height of one hour on the axis, in pixels, at every width (spec *UI architecture*). */
export const HOUR_HEIGHT = 40

/** How many day chips the calendar shows, starting today (DD-R03). */
export const CHIP_DAYS = 7

/**
 * The axis of a day: 08:00–22:00, widened by whole hours to the earliest opening or entry start and the latest
 * closing or entry end (DD-R02), never beyond the day. Empty spans are ignored.
 */
export function axisBounds(opening: readonly Span[] | null, entries: readonly Span[]): Span {
  let from = AXIS_START
  let to = AXIS_END
  for (const span of [...(opening ?? []), ...entries]) {
    if (span.to <= span.from) continue
    from = Math.min(from, Math.floor(span.from / HOUR) * HOUR)
    to = Math.max(to, Math.ceil(span.to / HOUR) * HOUR)
  }
  return { from: Math.max(0, from), to: Math.min(DAY_MINUTES, to) }
}

/** One hour scale for several axes side by side (a week's seven days, DD-W06): the earliest start, the latest end. */
export function unionBounds(bounds: readonly Span[]): Span {
  if (bounds.length === 0) return { from: AXIS_START, to: AXIS_END }
  return { from: Math.min(...bounds.map((b) => b.from)), to: Math.max(...bounds.map((b) => b.to)) }
}

/** The whole hours of the axis, as the minute each starts at. */
export function axisHours(bounds: Span): number[] {
  const hours: number[] = []
  for (let hour = bounds.from; hour < bounds.to; hour += HOUR) hours.push(hour)
  return hours
}

/** The offset of a minute from the top of the axis, in pixels. */
export function axisOffset(minutes: number, bounds: Span): number {
  return ((minutes - bounds.from) / HOUR) * HOUR_HEIGHT
}

/** The height of a span on the axis, in pixels. */
export function axisLength(span: Span): number {
  return ((span.to - span.from) / HOUR) * HOUR_HEIGHT
}

/** An item placed on the axis: its lane and the number of lanes of its group of overlapping items. */
export type Laned<T> = { item: T; lane: number; lanes: number }

/**
 * Lays overlapping items side by side (spec *UI architecture*: parallel entries stand side by side). Items are taken
 * by start (then the longer first); each takes the first lane free at its start. Items that overlap, directly or
 * through others, form a group whose items share its lane count; an item alone keeps the full width.
 */
export function layoutLanes<T extends Span>(items: readonly T[]): Array<Laned<T>> {
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.from - b.item.from || b.item.to - a.item.to || a.index - b.index)
  const placed: Array<Laned<T>> = []
  let group: Array<Laned<T>> = []
  let laneEnds: number[] = []
  let groupEnd = Number.NEGATIVE_INFINITY
  const close = () => {
    for (const entry of group) entry.lanes = laneEnds.length
    group = []
    laneEnds = []
  }
  for (const { item } of ordered) {
    if (item.from >= groupEnd) close()
    groupEnd = group.length === 0 ? item.to : Math.max(groupEnd, item.to)
    let lane = laneEnds.findIndex((end) => end <= item.from)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(item.to)
    } else {
      laneEnds[lane] = item.to
    }
    const entry = { item, lane, lanes: 1 }
    group.push(entry)
    placed.push(entry)
  }
  close()
  return placed
}

/** The most lanes any group of the day needs (at least 1), the width the axis reserves. */
export function maxLanes(laned: ReadonlyArray<{ lanes: number }>): number {
  return laned.reduce((most, entry) => Math.max(most, entry.lanes), 1)
}

/** A day the place does not open: opening hours exist and list no window. No limit (null) is not closed. */
export function isClosedDay(opening: readonly Span[] | null): boolean {
  return opening !== null && opening.length === 0
}

export type FreeHoursInput = {
  bounds: Span
  /** The day's opening windows; null = no limit. */
  opening: readonly Span[] | null
  /** The zones of the day; an hour touching a `closed` zone is not free. */
  zones: ReadonlyArray<Span & { zone: Zone }>
  /** Every entry of the day on the place's family. */
  entries: readonly Span[]
  date: CalendarDate
  today: CalendarDate
  /** The minutes of now on `today` in the club's zone. */
  nowMinutes: number
  /**
   * DD-R17: the earliest past day whose hours stay free, for the club administrator's past club booking; null or
   * absent = no past hour is free.
   */
  pastFrom?: CalendarDate | null
}

/** True when the hour starting at `hour` minutes of `date` began before now (DD-R17: a past club booking). */
export function hourInPast(date: CalendarDate, hour: number, today: CalendarDate, nowMinutes: number): boolean {
  return date < today || (date === today && hour < nowMinutes)
}

/**
 * The free open hours of a day, as the minute each starts at: whole hours of the axis inside an opening window, on no
 * closed zone and with no entry on them. A past day has none, and today none that started before now (TEST-R01) —
 * unless `pastFrom` reaches the day: then its past hours are free too (DD-R17).
 */
export function freeOpenHours(input: FreeHoursInput): number[] {
  const pastOpen = input.pastFrom !== undefined && input.pastFrom !== null && input.date >= input.pastFrom
  if ((input.date < input.today && !pastOpen) || isClosedDay(input.opening)) return []
  const overlaps = (span: Span, hour: number) => span.from < hour + HOUR && span.to > hour
  return axisHours(input.bounds).filter((hour) => {
    if (!pastOpen && hourInPast(input.date, hour, input.today, input.nowMinutes)) return false
    const open =
      input.opening === null || input.opening.some((window) => window.from <= hour && window.to >= hour + HOUR)
    if (!open) return false
    if (input.zones.some((zone) => zone.zone === 'closed' && overlaps(zone, hour))) return false
    return !input.entries.some((entry) => overlaps(entry, hour))
  })
}

/** The dates of the day chips: today and the following days (DD-R03). */
export function chipDates(today: CalendarDate, count: number = CHIP_DAYS): CalendarDate[] {
  return Array.from({ length: count }, (_, index) => addDays(today, index))
}

/** A zone rule as the availability card reads it (a row of `GET /api/facilities/zone-rules`). */
export type ZoneRuleLike = {
  id: string
  weekdays: readonly number[]
  timeFrom: string
  timeTo: string
  zone: Zone | null
  source: ZoneSource | null
  validFrom: string | null
  validTo: string | null
}

/** One bookable window of a weekday; `source` tells the regulation windows from the set availability. */
export type BookableWindow = {
  id: string
  from: string
  to: string
  validTo: string | null
  source: ZoneSource | null
}

/**
 * The `reservable_paid` windows of each weekday in force on `today`, by start (REQ-R03: every bookable window, those
 * from the regulations included). Weekdays without a window are absent.
 */
export function bookableWindowsByDay(
  rows: readonly ZoneRuleLike[],
  today: CalendarDate,
): Map<IsoWeekday, BookableWindow[]> {
  const byDay = new Map<IsoWeekday, BookableWindow[]>()
  for (const row of rows) {
    if (row.zone !== 'reservable_paid' || !row.validFrom) continue
    if (row.validFrom > today || (row.validTo !== null && row.validTo < today)) continue
    for (const day of row.weekdays) {
      const weekday = day as IsoWeekday
      const list = byDay.get(weekday) ?? []
      list.push({ id: row.id, from: row.timeFrom, to: row.timeTo, validTo: row.validTo, source: row.source })
      byDay.set(weekday, list)
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id))
  return byDay
}
