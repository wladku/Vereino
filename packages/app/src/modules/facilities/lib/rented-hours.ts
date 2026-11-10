// Pure rules of the rented-hours report (facilities spec REQ-038, TEST-053, AC-038; #129): for each place the club
// rents from its owner (`rented_by_club`), the hours of `done` sessions per month, group and coach, so that the club can
// check the owner's bill against its own log; and the CSV export with the same figures. A session counts in full, in
// the club-zone month it starts in, on the nearest flagged place at or above its own place. Nothing here reads the
// database or the clock (S3.5); the club time zone is a parameter.
import { calendarDateInZone, type CalendarDate } from '@vereino/core'
import { csvField, hoursOf } from './owner-report'

export type RentedPlaceInput = { readonly id: string; readonly name: string; readonly descendantIds: readonly string[] }

export type RentedSessionInput = {
  readonly placeId: string
  readonly start: Date
  readonly end: Date
  readonly groupId: string
  readonly groupName: string | null
  readonly coachPersonId: string | null
}

/** One place, month, group and coach. `month` is `YYYY-MM` in the club zone; hours have two decimals. */
export type RentedHoursRow = {
  placeId: string
  placeName: string
  month: string
  groupId: string
  groupName: string | null
  coachPersonId: string | null
  coachName: string | null
  sessions: number
  hours: number
}

/** One place and month: the sum of its rows (so the screen and the CSV add up). */
export type RentedHoursTotal = { placeId: string; placeName: string; month: string; sessions: number; hours: number }

export type RentedHoursReport = {
  from: CalendarDate
  to: CalendarDate
  timeZone: string
  /** Every place the club rents, by name, whether or not it has hours in the period (the place filter). */
  places: Array<{ id: string; name: string }>
  totals: RentedHoursTotal[]
  rows: RentedHoursRow[]
}

/**
 * The flagged place each place reports to, with the flagged place's position in `places`: the flagged place itself,
 * or the nearest flagged ancestor (the one with the fewest descendants among those that contain it).
 */
export function reportingPlaceOf(
  places: readonly RentedPlaceInput[],
): Map<string, { place: RentedPlaceInput; rank: number }> {
  const owner = new Map<string, { place: RentedPlaceInput; rank: number }>()
  const bySize = places
    .map((place, rank) => ({ place, rank }))
    .sort((a, b) => b.place.descendantIds.length - a.place.descendantIds.length)
  for (const entry of bySize) {
    for (const id of entry.place.descendantIds) owner.set(id, entry)
    owner.set(entry.place.id, entry)
  }
  return owner
}

/** Names in locale order; a missing name (null) sorts last. */
export function compareNames(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b)
}

function sumHours(values: readonly number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100
}

/** The report from the rented places (by name), the done sessions on them and their descendants, and coach names. */
export function rentedHoursReport(input: {
  from: CalendarDate
  to: CalendarDate
  timeZone: string
  places: readonly RentedPlaceInput[]
  sessions: readonly RentedSessionInput[]
  coachNames: ReadonlyMap<string, string>
}): RentedHoursReport {
  const reportingPlace = reportingPlaceOf(input.places)
  const groups = new Map<string, { row: RentedHoursRow; rank: number; minutes: number }>()
  for (const session of input.sessions) {
    const reporting = reportingPlace.get(session.placeId)
    if (!reporting) continue
    const { place, rank } = reporting
    const month = calendarDateInZone(session.start, input.timeZone).slice(0, 7)
    const key = [place.id, month, session.groupId, session.coachPersonId ?? ''].join('|')
    let entry = groups.get(key)
    if (!entry) {
      entry = {
        rank,
        minutes: 0,
        row: {
          placeId: place.id,
          placeName: place.name,
          month,
          groupId: session.groupId,
          groupName: session.groupName,
          coachPersonId: session.coachPersonId,
          coachName: session.coachPersonId ? (input.coachNames.get(session.coachPersonId) ?? null) : null,
          sessions: 0,
          hours: 0,
        },
      }
      groups.set(key, entry)
    }
    entry.row.sessions += 1
    entry.minutes += Math.max(0, session.end.getTime() - session.start.getTime()) / 60_000
  }
  const rows = [...groups.values()]
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.row.month.localeCompare(b.row.month) ||
        compareNames(a.row.groupName, b.row.groupName) ||
        compareNames(a.row.coachName, b.row.coachName),
    )
    .map((entry) => ({ ...entry.row, hours: hoursOf(entry.minutes) }))
  const totals: RentedHoursTotal[] = []
  for (const row of rows) {
    const last = totals.at(-1)
    if (last && last.placeId === row.placeId && last.month === row.month) {
      last.sessions += row.sessions
      last.hours = sumHours([last.hours, row.hours])
    } else {
      totals.push({
        placeId: row.placeId,
        placeName: row.placeName,
        month: row.month,
        sessions: row.sessions,
        hours: row.hours,
      })
    }
  }
  return {
    from: input.from,
    to: input.to,
    timeZone: input.timeZone,
    places: input.places.map((place) => ({ id: place.id, name: place.name })),
    totals,
    rows,
  }
}

/**
 * The report as CSV, with the figures the screen shows: the totals per place and month (`place,month,sessions,hours`),
 * an empty line, then the rows per group and coach. Hours with two decimals; a missing group or coach is an empty
 * field. CRLF line ends.
 */
export function rentedHoursCsv(report: RentedHoursReport): string {
  const lines = [
    'place,month,sessions,hours',
    ...report.totals.map((total) =>
      [csvField(total.placeName), total.month, String(total.sessions), total.hours.toFixed(2)].join(','),
    ),
    '',
    'place,month,group,coach,sessions,hours',
    ...report.rows.map((row) =>
      [
        csvField(row.placeName),
        row.month,
        csvField(row.groupName ?? ''),
        csvField(row.coachName ?? ''),
        String(row.sessions),
        row.hours.toFixed(2),
      ].join(','),
    ),
  ]
  return lines.join('\r\n') + '\r\n'
}
