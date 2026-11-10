// Pure rules of the owner (municipality) report (facilities spec REQ-015, TEST-025, AC-015; README B-28, flow F-12;
// #127): the period a report may cover (from ≤ to, at most one year), the scheduled hours of each zone, the club time
// (sessions and internal bookings) split by the zone it fell in, which rentals count and which count as paid in the
// rental register, and the CSV export. Nothing here reads the database or the clock (S3.5); the club time zone is a
// parameter.
import { addDays, zonedInstant, type CalendarDate } from '@vereino/core'
import { localSlotOf, type RentalStatus } from './rentals'
import { ZONES, dayZoneSegments, type Zone, type ZoneRuleShape } from './zones'

/** The rentals the report counts and values (B-28): every rental that was billable — not rejected, expired, superseded or cancelled for free. */
export const REPORTED_RENTAL_STATUSES: readonly RentalStatus[] = [
  'requested',
  'confirmed',
  'done',
  'cancelled_late',
  'no_show',
]

/**
 * The rentals the rental register counts as paid to the owner's account (DD-19: without `payments` staff confirm a
 * rental with `confirm` once the payment is in; `done` follows only from `confirmed`).
 */
export const PAID_RENTAL_STATUSES: readonly RentalStatus[] = ['confirmed', 'done']

/** Where the payments figure comes from; only the rental register exists until `payments` reports rental charges. */
export type PaymentsSource = 'rental_register'

export type ReportPeriodProblem = 'report_period_order' | 'report_period_too_long'

/** The date one year after `date` (29 February → 1 March). */
function oneYearAfter(date: CalendarDate): CalendarDate {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year + 1, month - 1, day)).toISOString().slice(0, 10)
}

/** Why `from`–`to` (inclusive club dates) is not a report period, or null: `to` before `from`, or a year or longer (422). */
export function reportPeriodProblem(from: CalendarDate, to: CalendarDate): ReportPeriodProblem | null {
  if (to < from) return 'report_period_order'
  if (to >= oneYearAfter(from)) return 'report_period_too_long'
  return null
}

/** Every date from `from` to `to`, inclusive. */
export function periodDates(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const dates: CalendarDate[] = []
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date)
  return dates
}

/** The first and last day of the month or quarter that contains `date` (the B-28 presets). */
export function presetPeriod(kind: 'month' | 'quarter', date: CalendarDate): { from: CalendarDate; to: CalendarDate } {
  const [year, month] = date.split('-').map(Number)
  const first = kind === 'month' ? month : Math.floor((month - 1) / 3) * 3 + 1
  const months = kind === 'month' ? 1 : 3
  const from = `${String(year)}-${String(first).padStart(2, '0')}-01`
  const to = new Date(Date.UTC(year, first - 1 + months, 0)).toISOString().slice(0, 10)
  return { from, to }
}

/** The month or quarter before or after the one that starts on `from` (the B-28 previous / next buttons). */
export function shiftPeriod(
  kind: 'month' | 'quarter',
  from: CalendarDate,
  steps: number,
): { from: CalendarDate; to: CalendarDate } {
  const [year, month] = from.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 + steps * (kind === 'month' ? 1 : 3), 1))
  return presetPeriod(kind, shifted.toISOString().slice(0, 10))
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Minutes as hours with two decimals (the figures the report and its CSV show). */
export function hoursOf(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100
}

export type ZoneMinutes = Record<Zone, number>

function noZoneMinutes(): ZoneMinutes {
  return Object.fromEntries(ZONES.map((zone) => [zone, 0])) as ZoneMinutes
}

/**
 * The scheduled minutes of each zone on the places over the dates: for each place and date the effective zones
 * (`dayZoneSegments`), counted in wall-clock time.
 */
export function scheduledZoneMinutes(
  rulesByPlace: ReadonlyMap<string, readonly ZoneRuleShape[]>,
  dates: readonly CalendarDate[],
): ZoneMinutes {
  const totals = noZoneMinutes()
  for (const rules of rulesByPlace.values()) {
    for (const date of dates) {
      for (const segment of dayZoneSegments(rules, date)) {
        totals[segment.zone] += minutesOf(segment.to) - minutesOf(segment.from)
      }
    }
  }
  return totals
}

export type ClubTimeEntry = { readonly placeId: string; readonly start: Date; readonly end: Date }

/** Club time by the zone it fell in; `none` = outside every zone of its place. */
export type ClubZoneMinutes = ZoneMinutes & { none: number }

type ZoneInterval = { start: number; end: number; zone: Zone }

/** The zone segments of a place over the dates as instants in the club zone. */
function zoneIntervals(
  rules: readonly ZoneRuleShape[],
  dates: readonly CalendarDate[],
  timeZone: string,
): ZoneInterval[] {
  return dates.flatMap((date) =>
    dayZoneSegments(rules, date).map((segment) => ({
      start: zonedInstant(date, segment.from, timeZone).getTime(),
      end: (segment.to === '24:00'
        ? zonedInstant(addDays(date, 1), '00:00', timeZone)
        : zonedInstant(date, segment.to, timeZone)
      ).getTime(),
      zone: segment.zone,
    })),
  )
}

/**
 * The minutes of the entries inside the window (each clipped to it; entries are summed, not merged, so two groups on
 * two courts at once count twice), split by the zone of the entry's own place they fell in.
 */
export function clubZoneMinutes(
  entries: readonly ClubTimeEntry[],
  rulesByPlace: ReadonlyMap<string, readonly ZoneRuleShape[]>,
  dates: readonly CalendarDate[],
  timeZone: string,
  window: { start: Date; end: Date },
): ClubZoneMinutes {
  const totals: ClubZoneMinutes = { ...noZoneMinutes(), none: 0 }
  const intervals = new Map<string, ZoneInterval[]>()
  for (const entry of entries) {
    const start = Math.max(entry.start.getTime(), window.start.getTime())
    const end = Math.min(entry.end.getTime(), window.end.getTime())
    if (end <= start) continue
    let placeIntervals = intervals.get(entry.placeId)
    if (!placeIntervals) {
      placeIntervals = zoneIntervals(rulesByPlace.get(entry.placeId) ?? [], dates, timeZone)
      intervals.set(entry.placeId, placeIntervals)
    }
    let zoned = 0
    for (const interval of placeIntervals) {
      const overlap = Math.min(end, interval.end) - Math.max(start, interval.start)
      if (overlap <= 0) continue
      totals[interval.zone] += overlap / 60_000
      zoned += overlap
    }
    totals.none += (end - start - zoned) / 60_000
  }
  return totals
}

export type OwnerReportRental = {
  id: string
  start: string
  end: string
  renter: string
  units: number
  amount: number
  status: RentalStatus
}

export type OwnerReport = {
  place: { id: string; name: string }
  from: CalendarDate
  to: CalendarDate
  timeZone: string
  currency: string
  /** Scheduled hours of each zone on the facility's places. */
  zoneHours: Record<Zone, number>
  clubTime: { total: number; sessions: number; bookings: number; byZone: Record<Zone | 'none', number> }
  rentals: { count: number; value: number; items: OwnerReportRental[] }
  payments: { amount: number; count: number; source: PaymentsSource }
  incidents: { count: number }
  maintenance: { done: number; cost: number }
}

/** True when nothing happened at the facility in the period: no club time, rental, payment, incident or maintenance. */
export function ownerReportEmpty(report: OwnerReport): boolean {
  return (
    report.clubTime.total === 0 &&
    report.rentals.count === 0 &&
    report.payments.count === 0 &&
    report.incidents.count === 0 &&
    report.maintenance.done === 0
  )
}

/** Grosz as a plain decimal with two places (`199000` → `1990.00`). */
function groszToDecimal(grosz: number): string {
  const sign = grosz < 0 ? '-' : ''
  const absolute = Math.abs(grosz)
  return `${sign}${String(Math.floor(absolute / 100))}.${String(absolute % 100).padStart(2, '0')}`
}

/** One CSV field, quoted when it holds a separator, a quote or a line break; a formula prefix is neutralized. */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function hoursField(hours: number): string {
  return hours.toFixed(2)
}

/**
 * The report as CSV, with the figures the screen shows: a `section,item,value` summary (hours with two decimals,
 * amounts in the club currency with two decimals), an empty line, then the period's rentals with their date and wall
 * times in the club zone. CRLF line ends.
 */
export function ownerReportCsv(report: OwnerReport): string {
  // Only the place name is free text; the rest are fixed keys, dates and numbers.
  const summary: Array<[string, string, string]> = [
    ['report', 'place', csvField(report.place.name)],
    ['report', 'from', report.from],
    ['report', 'to', report.to],
    ['report', 'currency', report.currency],
    ...ZONES.map((zone): [string, string, string] => ['zone_hours', zone, hoursField(report.zoneHours[zone])]),
    ['club_time', 'total', hoursField(report.clubTime.total)],
    ['club_time', 'sessions', hoursField(report.clubTime.sessions)],
    ['club_time', 'bookings', hoursField(report.clubTime.bookings)],
    ...[...ZONES, 'none' as const].map((zone): [string, string, string] => [
      'club_time_by_zone',
      zone,
      hoursField(report.clubTime.byZone[zone]),
    ]),
    ['rentals', 'count', String(report.rentals.count)],
    ['rentals', 'value', groszToDecimal(report.rentals.value)],
    ['payments', 'amount', groszToDecimal(report.payments.amount)],
    ['payments', 'count', String(report.payments.count)],
    ['payments', 'source', report.payments.source],
    ['incidents', 'count', String(report.incidents.count)],
    ['maintenance', 'done', String(report.maintenance.done)],
    ['maintenance', 'cost', groszToDecimal(report.maintenance.cost)],
  ]
  const rentals = report.rentals.items.map((rental) => {
    const slot = localSlotOf(new Date(rental.start), new Date(rental.end), report.timeZone)
    return [
      slot.date,
      slot.from,
      slot.to,
      csvField(rental.renter),
      String(rental.units),
      groszToDecimal(rental.amount),
      rental.status,
    ].join(',')
  })
  const lines = [
    'section,item,value',
    ...summary.map((row) => row.join(',')),
    '',
    'date,from,to,renter,units,amount,status',
    ...rentals,
  ]
  return lines.join('\r\n') + '\r\n'
}
