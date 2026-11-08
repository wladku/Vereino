// Pure rules of the public facility calendar (facilities spec glossary *Public facility calendar*, P-04, REQ-014,
// TEST-024; #124): the month a guest may read, and one day of a place as stretches of time with a state and nothing
// else — no names, no kinds of closure, no ids. A day starts from the place's effective zones inside its opening
// hours; the entries on the place family then cover them: a closure "closed", a club session or an internal booking
// "taken by the club", a rental "booked", a request holding the slot "requested — pending". A free stretch of the
// `reservable_paid` zone is "bookable", and offers "Request a booking" when the place and the club take online
// requests, it starts in the future and it is at least one 90-minute unit long. Nothing here reads the database or
// the clock (S3.5): the caller passes the dates, the time zone and the current instant.
import { addDays, calendarDateInZone, calendarMonth, minutesOfDay, type CalendarDate } from '@vereino/core'
import type { RentalRateShape, RenterCategory } from './rates'
import { PUBLIC_RENTER_CATEGORIES } from './rates'
import { MIN_AVAILABILITY_MINUTES, type Zone } from './zones'

/** What a guest sees of a stretch of time. */
export const PUBLIC_SLOT_STATES = [
  'public_free',
  'club_training',
  'bookable',
  'closed',
  'club',
  'booked',
  'requested',
] as const
export type PublicSlotState = (typeof PUBLIC_SLOT_STATES)[number]

/** The entry kinds of the staff calendar (`services/calendar.ts`). */
export type ScheduleEntryKind = 'session' | 'booking' | 'rental' | 'request' | 'closure'

/** The state an entry shows the public: never who or why. */
export function entryState(kind: ScheduleEntryKind): PublicSlotState {
  if (kind === 'closure') return 'closed'
  if (kind === 'rental') return 'booked'
  if (kind === 'request') return 'requested'
  return 'club'
}

/** The state of a free stretch of a zone. */
export function zoneState(zone: Zone): PublicSlotState {
  return zone === 'reservable_paid' ? 'bookable' : zone
}

/** Which state wins where several cover the same minute: a closure first, a free zone last. */
const STATE_RANK: Record<PublicSlotState, number> = {
  closed: 6,
  club: 5,
  booked: 4,
  requested: 3,
  club_training: 2,
  public_free: 1,
  bookable: 1,
}

/** The months a guest may read: from the month before the current one to twelve months ahead. */
export const PUBLIC_MONTHS_BACK = 1
export const PUBLIC_MONTHS_AHEAD = 12

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export type ScheduleMonth = {
  month: string
  first: CalendarDate
  last: CalendarDate
  /** The neighbouring months a guest may still read, or null at the edge. */
  previous: string | null
  next: string | null
}

const monthOf = (date: CalendarDate): string => date.slice(0, 7)

/**
 * The month of `?month=YYYY-MM` (the current club month without it), or null for a malformed month or one outside the
 * readable range (400).
 */
export function scheduleMonth(month: string | undefined, today: CalendarDate): ScheduleMonth | null {
  const requested = month ?? monthOf(today)
  if (!MONTH_PATTERN.test(requested)) return null
  const earliest = monthOf(calendarMonth(today, -PUBLIC_MONTHS_BACK).from)
  const latest = monthOf(calendarMonth(today, PUBLIC_MONTHS_AHEAD).from)
  if (requested < earliest || requested > latest) return null
  const window = calendarMonth(`${requested}-01`)
  const previous = monthOf(calendarMonth(window.from, -1).from)
  const next = monthOf(calendarMonth(window.from, 1).from)
  return {
    month: requested,
    first: window.from,
    last: window.to,
    previous: previous >= earliest ? previous : null,
    next: next <= latest ? next : null,
  }
}

/** Every date from `first` to `last`. */
export function datesBetween(first: CalendarDate, last: CalendarDate): CalendarDate[] {
  const dates: CalendarDate[] = []
  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date)
  return dates
}

const MINUTES_PER_DAY = 24 * 60

/** The minute of the day an instant shows in a time zone. */
export function minuteInZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const byType = Object.fromEntries(parts.map((entry) => [entry.type, entry.value])) as Record<string, string>
  return Number(byType.hour) * 60 + Number(byType.minute)
}

/**
 * The part of `[start, end)` on a club-zone date, in minutes of that day (`to` 1440 = until midnight), or null when the
 * interval does not touch the date.
 */
export function minutesOnDate(
  interval: { start: Date; end: Date },
  date: CalendarDate,
  timeZone: string,
): { from: number; to: number } | null {
  if (interval.end.getTime() <= interval.start.getTime()) return null
  const startDate = calendarDateInZone(interval.start, timeZone)
  const lastDate = calendarDateInZone(new Date(interval.end.getTime() - 1), timeZone)
  if (date < startDate || date > lastDate) return null
  const from = startDate === date ? minuteInZone(interval.start, timeZone) : 0
  const to = lastDate === date ? minuteInZone(interval.end, timeZone) || MINUTES_PER_DAY : MINUTES_PER_DAY
  return to > from ? { from, to } : null
}

export type PublicSlot = { from: string; to: string; state: PublicSlotState; canRequest: boolean }

type Stretch = { from: number; to: number; state: PublicSlotState }

const timeOf = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** The stretch of `HH:MM`–`HH:MM` in minutes (`24:00` and an end at midnight read as 1440). */
function stretchOf(from: string, to: string): { from: number; to: number } {
  const end = minutesOfDay(to)
  return { from: minutesOfDay(from), to: end === 0 ? MINUTES_PER_DAY : end }
}

/** The zones inside the opening windows (`null` = no limit, `[]` = closed all day). */
function openZones(
  zones: ReadonlyArray<{ from: string; to: string; zone: Zone }>,
  opening: ReadonlyArray<{ from: string; to: string }> | null,
): Stretch[] {
  const stretches: Stretch[] = []
  for (const zone of zones) {
    const span = stretchOf(zone.from, zone.to)
    const windows = opening === null ? [{ from: 0, to: MINUTES_PER_DAY }] : opening.map((w) => stretchOf(w.from, w.to))
    for (const window of windows) {
      const from = Math.max(span.from, window.from)
      const to = Math.min(span.to, window.to)
      if (to > from) stretches.push({ from, to, state: zoneState(zone.zone) })
    }
  }
  return stretches
}

/**
 * One day of a place for the public: the zones inside the opening hours, covered by the entries of the day (the
 * state of the highest rank wins a minute), merged into stretches. `notBefore` is the first minute a request may start
 * (the current minute today, 0 on a later day, 1440 on a past day); `requestsEnabled` is the place's and the club's
 * switch together.
 */
export function publicDaySlots(input: {
  zones: ReadonlyArray<{ from: string; to: string; zone: Zone }>
  opening: ReadonlyArray<{ from: string; to: string }> | null
  entries: ReadonlyArray<{ from: number; to: number; state: PublicSlotState }>
  requestsEnabled: boolean
  notBefore: number
}): PublicSlot[] {
  const layers: Stretch[] = [...openZones(input.zones, input.opening), ...input.entries]
  const bounds = [...new Set(layers.flatMap((layer) => [layer.from, layer.to]))].sort((a, b) => a - b)
  const merged: Stretch[] = []
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const from = bounds[index]
    const to = bounds[index + 1]
    const winner = layers
      .filter((layer) => layer.from <= from && to <= layer.to)
      .sort((a, b) => STATE_RANK[b.state] - STATE_RANK[a.state])
      .at(0)
    if (!winner) continue
    const previous = merged.at(-1)
    if (previous && previous.to === from && previous.state === winner.state) previous.to = to
    else merged.push({ from, to, state: winner.state })
  }
  return merged.map((stretch) => ({
    from: timeOf(stretch.from),
    to: timeOf(stretch.to),
    state: stretch.state,
    canRequest:
      input.requestsEnabled &&
      stretch.state === 'bookable' &&
      stretch.from >= input.notBefore &&
      stretch.to - stretch.from >= MIN_AVAILABILITY_MINUTES,
  }))
}

/** The first minute of `date` a request may start: past days none, today the current minute, later days all. */
export function firstRequestMinute(date: CalendarDate, now: Date, timeZone: string): number {
  const today = calendarDateInZone(now, timeZone)
  if (date < today) return MINUTES_PER_DAY
  return date === today ? minuteInZone(now, timeZone) : 0
}

export type PublicRate = {
  category: RenterCategory
  /** Minor units per 90-minute unit. */
  pricePer90: number
  seasonFrom: string | null
  seasonTo: string | null
  includesLighting: boolean
}

/**
 * The rates of the public renter categories in force on any day of the month, cheapest first within a category: the
 * guest sees what a 90-minute unit costs (the staff-only winter-lighting rate is left out).
 */
export function publicRates(
  rates: readonly RentalRateShape[],
  placeId: string,
  first: CalendarDate,
  last: CalendarDate,
): PublicRate[] {
  return rates
    .filter(
      (rate) =>
        rate.placeId === placeId &&
        PUBLIC_RENTER_CATEGORIES.includes(rate.renterCategory) &&
        rate.validFrom <= last &&
        (rate.validTo === null || rate.validTo >= first),
    )
    .sort(
      (a, b) =>
        PUBLIC_RENTER_CATEGORIES.indexOf(a.renterCategory) - PUBLIC_RENTER_CATEGORIES.indexOf(b.renterCategory) ||
        a.pricePer90 - b.pricePer90,
    )
    .map((rate) => ({
      category: rate.renterCategory,
      pricePer90: rate.pricePer90,
      seasonFrom: rate.seasonFrom,
      seasonTo: rate.seasonTo,
      includesLighting: rate.includesLighting,
    }))
}
