// The PZPN exports (training outlines spec REQ-O10, DD-O06, DD-O09, M-O9; E24-S04, #684): a team's schedule and
// attendance for a period as CSV files shaped like PZPN's "Harmonogram treningowy" and "Lista obecności", for a coach
// or coordinator to copy into PZPN's academy system (it has no import, D-038 §3). Pure: the service reads the sessions,
// the attendance rows and the names, and this file turns them into rows and CSV text.
//
// The columns live here, in one place, because PZPN may change its forms (spec risk table; V-O1 rechecks them each
// season). Column headers follow the user's language; the event type, the schedule status and the attendance status
// are always Polish, as they are PZPN's own values.
import type { CalendarDate } from '@vereino/core'
import { csvField, type CsvSeparator } from './coach-units'

/** The longest period one export covers (spec API table: `from`, `to` ≤ 1 year). */
export const PZPN_PERIOD_MAX_DAYS = 366

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function dayNumber(date: string): number | null {
  if (!DATE_PATTERN.test(date)) return null
  const time = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) return null
  return time / 86_400_000
}

/** Whether `from`…`to` is a valid period of at most `PZPN_PERIOD_MAX_DAYS` days (both days included). */
export function isPzpnPeriod(from: string, to: string): boolean {
  const start = dayNumber(from)
  const end = dayNumber(to)
  if (start === null || end === null) return false
  return end >= start && end - start + 1 <= PZPN_PERIOD_MAX_DAYS
}

/** PZPN's event type per activity type (*Harmonogram*: Trening / Mecz / Turniej / Sparing / Obóz / Inne). */
const PZPN_EVENT_TYPES: Readonly<Record<string, string>> = {
  training: 'Trening',
  match: 'Mecz',
  tournament: 'Turniej',
  sparring: 'Sparing',
  camp: 'Obóz',
  other: 'Inne',
}

/** The PZPN event type of an activity type; an unknown type is "Inne". */
export function pzpnEventType(type: string): string {
  return PZPN_EVENT_TYPES[type] ?? PZPN_EVENT_TYPES.other
}

/** The schedule status: a cancelled session is "Odwołane", any other (planned or held) "Zaplanowane". */
export function pzpnScheduleStatus(status: string): string {
  return status === 'cancelled' ? 'Odwołane' : 'Zaplanowane'
}

/** One attendance row of a player at a session, as the export reads it. */
export type PzpnAttendanceFacts = {
  actual: string | null
  declared: string | null
  declarationStatus: string | null
  declaredAt: Date | null
}

/**
 * The PZPN attendance status (*Lista obecności*, ch. 12): present or late → "Obecny"; absent with a final "no"
 * declared before the session start → "Usprawiedliwiony"; any other absence → "Nieobecny"; not marked → empty.
 */
export function pzpnAttendanceStatus(facts: PzpnAttendanceFacts | undefined, startAt: Date): string {
  if (!facts?.actual) return ''
  if (facts.actual === 'present' || facts.actual === 'late') return 'Obecny'
  const excused =
    facts.declared === 'no' &&
    facts.declarationStatus === 'final' &&
    facts.declaredAt !== null &&
    facts.declaredAt.getTime() < startAt.getTime()
  return excused ? 'Usprawiedliwiony' : 'Nieobecny'
}

/** A session of the schedule, with the names the service resolved. */
export type PzpnScheduleSession = {
  team: string
  type: string
  date: CalendarDate
  /** `HH:mm` in the club's time zone. */
  start: string
  end: string
  place: string | null
  /** The outline topic when the session has one (`training.outlineTopics`), else null. */
  topic: string | null
  activityName: string
  coach: string | null
  status: string
}

export type PzpnScheduleColumn = 'team' | 'eventType' | 'date' | 'start' | 'end' | 'place' | 'name' | 'coach' | 'status'

export const PZPN_SCHEDULE_COLUMNS: readonly PzpnScheduleColumn[] = [
  'team',
  'eventType',
  'date',
  'start',
  'end',
  'place',
  'name',
  'coach',
  'status',
]

/** One schedule row in column order: the name is the outline topic when present, else the activity name. */
export function pzpnScheduleRow(session: PzpnScheduleSession): string[] {
  return [
    session.team,
    pzpnEventType(session.type),
    session.date,
    session.start,
    session.end,
    session.place ?? '',
    session.topic ?? session.activityName,
    session.coach ?? '',
    pzpnScheduleStatus(session.status),
  ]
}

/** A player at a session, with the attendance facts (absent when the player has no row). */
export type PzpnAttendanceEntry = {
  team: string
  date: CalendarDate
  start: string
  startAt: Date
  lastName: string
  firstName: string
  birthDate: string | null
  facts: PzpnAttendanceFacts | undefined
}

export type PzpnAttendanceColumn = 'team' | 'date' | 'start' | 'lastName' | 'firstName' | 'birthDate' | 'status'

export const PZPN_ATTENDANCE_COLUMNS: readonly PzpnAttendanceColumn[] = [
  'team',
  'date',
  'start',
  'lastName',
  'firstName',
  'birthDate',
  'status',
]

export function pzpnAttendanceRow(entry: PzpnAttendanceEntry): string[] {
  return [
    entry.team,
    entry.date,
    entry.start,
    entry.lastName,
    entry.firstName,
    entry.birthDate ?? '',
    pzpnAttendanceStatus(entry.facts, entry.startAt),
  ]
}

/** Sessions by start, then players by last name, first name (the order the paper list uses). */
export function sortPzpnAttendance(entries: readonly PzpnAttendanceEntry[]): PzpnAttendanceEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.startAt.getTime() - b.startAt.getTime() ||
      a.lastName.localeCompare(b.lastName, 'pl') ||
      a.firstName.localeCompare(b.firstName, 'pl'),
  )
}

type Translate = (key: string, fallback: string) => string

const SCHEDULE_HEADERS: Record<PzpnScheduleColumn, string> = {
  team: 'Team',
  eventType: 'Event type',
  date: 'Date',
  start: 'Start',
  end: 'End',
  place: 'Place',
  name: 'Name / general goal',
  coach: 'Coach',
  status: 'Status',
}

const ATTENDANCE_HEADERS: Record<PzpnAttendanceColumn, string> = {
  team: 'Team',
  date: 'Date',
  start: 'Start',
  lastName: 'Last name',
  firstName: 'First name',
  birthDate: 'Birth date',
  status: 'Status',
}

/** The schedule headers in the user's language (`activities.reports.pzpn.schedule.columns.*`). */
export function pzpnScheduleHeaders(translate: Translate): string[] {
  return PZPN_SCHEDULE_COLUMNS.map((column) =>
    translate(`activities.reports.pzpn.schedule.columns.${column}`, SCHEDULE_HEADERS[column]),
  )
}

/** The attendance headers in the user's language (`activities.reports.pzpn.attendance.columns.*`). */
export function pzpnAttendanceHeaders(translate: Translate): string[] {
  return PZPN_ATTENDANCE_COLUMNS.map((column) =>
    translate(`activities.reports.pzpn.attendance.columns.${column}`, ATTENDANCE_HEADERS[column]),
  )
}

/** The byte order mark that makes a spreadsheet read the file as UTF-8 (DD-O09). */
export const UTF8_BOM = '﻿'

/** A CSV file: BOM, header line, one line per row, CRLF line ends, every field escaped. */
export function pzpnCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  separator: CsvSeparator,
): string {
  const lines = [headers, ...rows].map((cells) => cells.map((cell) => csvField(cell, separator)).join(separator))
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

export type PzpnExportKind = 'schedule' | 'attendance'

/** The download file name: `pzpn-<kind>-<from>-<to>.csv` (ASCII only, no team name). */
export function pzpnFileName(kind: PzpnExportKind, from: string, to: string): string {
  return `pzpn-${kind}-${from}-${to}.csv`
}
