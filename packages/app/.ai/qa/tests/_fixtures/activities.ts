// Helpers of the `activities` integration tests (club spec phase 2 steps 3 and 8; TEST-007, TEST-012, TEST-034; issue
// #31): activities, previews, sessions, one-off events and cancellations through the API, the daily generator through
// the module CLI, the in-app notifications of a user, and club-zone (`Europe/Warsaw`) calendar and wall-time helpers.
import { expect, type APIRequestContext } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call, mercato, type Club } from './club'
import { create as createStructure } from './club-structure'
import { createGroup, signedInStaff } from './groups'

export const CLUB_ZONE = 'Europe/Warsaw'

export type ActivityItem = {
  id: string
  sectionId: string | null
  groupId: string | null
  name: string | null
  type: string | null
  placeId: string | null
  coachPersonId: string | null
  invitedExternalTeamIds: string[]
  recurrenceRule: string | null
  startsOn: string | null
  endsOn: string | null
  startTime: string | null
  endTime: string | null
  generatedUntil: string | null
  isActive: boolean
  updatedAt: string | null
  actingRole?: string
  code?: string
}

export type OccurrenceItem = {
  id: string
  activityId: string | null
  activityName?: string | null
  groupId: string | null
  sectionId: string | null
  occurrenceDate: string | null
  startAt: string | null
  endAt: string | null
  placeId: string | null
  coachPersonId: string | null
  status: string | null
  cancelReason: string | null
  isDetached: boolean
  needsReschedule: boolean
  updatedAt: string | null
  actingRole?: string
  code?: string
}

export type ConflictEntry = {
  key: string
  startAt: string
  endAt: string
  kind: 'place' | 'coach'
  sessions: { id: string; activityId: string; activityName: string | null; groupId: string; placeId: string }[]
  blocks: { id: string; reason: string }[]
}

export type CodedError = { error?: string; code?: string; conflicts?: ConflictEntry[] }

export type PreviewResult = CodedError & {
  items?: { date: string; startAt: string; endAt: string; existingId: string | null; conflicts: ConflictEntry[] }[]
  total?: number
  conflictCount?: number
  generatedUntil?: string | null
  horizonEnd?: string
  providerFailed?: boolean
}

type List<T> = { items?: T[]; total?: number }

export type ScheduleSetup = {
  academy: string
  pitch: string
  zaki: string
  orliki: string
  /** The token of the academy's coordinator. */
  coordinator: string
  coordinatorPersonId: string
  coordinatorUserId: string
}

/** The football academy with one pitch (`capacityGroups: 1`), the teams Żaki and Orliki and the academy's coordinator. */
export async function scheduleFor(request: APIRequestContext, club: Club): Promise<ScheduleSetup> {
  const admin = club.adminToken
  const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
  const pitch = await createStructure(request, admin, 'places', { name: 'Boisko A', kind: 'pitch', capacityGroups: 1 })
  const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
  const orliki = await createGroup(request, admin, { sectionId: academy, name: 'Orliki', kind: 'team' })
  const coordinator = await signedInStaff(request, club, {
    firstName: 'Krystyna',
    lastName: 'Koordynator',
    role: 'coordinator',
    sectionId: academy,
  })
  return {
    academy,
    pitch,
    zaki,
    orliki,
    coordinator: coordinator.token,
    coordinatorPersonId: coordinator.personId,
    coordinatorUserId: coordinator.userId,
  }
}

const lockHeaders = (lockToken: string | null | undefined): Record<string, string> =>
  lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {}

// --- Activities ---

export async function postActivity(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string; sessionsCreated?: number; generatedUntil?: string | null }>(
    request,
    'POST',
    '/api/activities/activities',
    token,
    { data },
  )
}

/** Creates an activity (201 expected) and returns its id with the number of sessions it generated. */
export async function createActivity(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
): Promise<{ id: string; sessionsCreated: number; generatedUntil: string | null }> {
  const result = await postActivity(request, token, data)
  expect(result.status, `POST /api/activities/activities ${JSON.stringify(result.body)}`).toBe(201)
  return {
    id: String(result.body?.id),
    sessionsCreated: Number(result.body?.sessionsCreated),
    generatedUntil: result.body?.generatedUntil ?? null,
  }
}

export async function getActivity(request: APIRequestContext, token: string, id: string) {
  return call<ActivityItem>(request, 'GET', `/api/activities/activities/${id}`, token)
}

export async function listActivities(
  request: APIRequestContext,
  token: string,
  query = '',
): Promise<{ status: number; items: ActivityItem[] }> {
  const result = await call<List<ActivityItem>>(
    request,
    'GET',
    `/api/activities/activities?pageSize=200${query}`,
    token,
  )
  return { status: result.status, items: result.body?.items ?? [] }
}

/** `PUT /api/activities/activities` with the given lock token. */
export async function updateActivity(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown> & { id: string },
  lockToken: string | null | undefined,
) {
  return call<
    CodedError & {
      ok?: boolean
      updatedAt?: string
      actingRole?: string
      sessions?: { created: number; updated: number; removed: number }
    }
  >(request, 'PUT', '/api/activities/activities', token, { data, headers: lockHeaders(lockToken) })
}

export async function deleteActivity(
  request: APIRequestContext,
  token: string,
  id: string,
  lockToken: string | null | undefined,
) {
  return call<CodedError & { ok?: boolean }>(request, 'DELETE', `/api/activities/activities?id=${id}`, token, {
    headers: lockHeaders(lockToken),
  })
}

export async function preview(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<PreviewResult>(request, 'POST', '/api/activities/activities/preview', token, { data })
}

// --- Sessions ---

/** Sessions in the caller's scope, by slot date (filters as query string: `&activityId=…`). */
export async function listOccurrences(
  request: APIRequestContext,
  token: string,
  query = '',
): Promise<{ status: number; items: OccurrenceItem[]; total: number }> {
  const result = await call<List<OccurrenceItem>>(
    request,
    'GET',
    `/api/activities/occurrences?pageSize=200&sortField=occurrenceDate&sortDir=asc${query}`,
    token,
  )
  return { status: result.status, items: result.body?.items ?? [], total: result.body?.total ?? 0 }
}

export async function getOccurrence(request: APIRequestContext, token: string, id: string) {
  return call<OccurrenceItem>(request, 'GET', `/api/activities/occurrences/${id}`, token)
}

/** `PATCH /api/activities/occurrences/{id}` (move or re-staff) with the given lock token. */
export async function moveOccurrence(
  request: APIRequestContext,
  token: string,
  id: string,
  data: Record<string, unknown>,
  lockToken: string | null | undefined,
) {
  return call<CodedError & { ok?: boolean; updatedAt?: string; actingRole?: string }>(
    request,
    'PATCH',
    `/api/activities/occurrences/${id}`,
    token,
    { data, headers: lockHeaders(lockToken) },
  )
}

/** `POST /api/activities/occurrences/{id}/cancel`; `reason` undefined sends an empty body. */
export async function cancelOccurrence(
  request: APIRequestContext,
  token: string,
  id: string,
  reason: string | undefined,
  lockToken: string | null | undefined,
) {
  return call<CodedError & { ok?: boolean; status?: string; updatedAt?: string; actingRole?: string }>(
    request,
    'POST',
    `/api/activities/occurrences/${id}/cancel`,
    token,
    { data: reason === undefined ? {} : { reason }, headers: lockHeaders(lockToken) },
  )
}

export async function createEvent(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string; occurrenceId?: string; actingRole?: string }>(
    request,
    'POST',
    '/api/activities/events',
    token,
    { data },
  )
}

// --- The daily generator and notifications ---

export type GeneratorCounts = {
  today: string
  processed: number
  skipped: number
  failed: number
  created: number
  flagged: number
}

/** Runs `yarn mercato activities generate-occurrences` for the club (optionally as of another day). */
export function runGenerator(club: Club, today?: string): GeneratorCounts {
  const result = mercato([
    'activities',
    'generate-occurrences',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    ...(today ? ['--today', today] : []),
  ]) as GeneratorCounts | null
  if (!result) throw new Error('[internal] activities generate-occurrences printed no result')
  return result
}

export type NotificationItem = {
  id: string
  type: string
  sourceEntityType: string | null
  sourceEntityId: string | null
  titleVariables?: Record<string, string> | null
  bodyVariables?: Record<string, string> | null
}

/** The in-app notifications of the token's user (`GET /api/notifications`), optionally filtered. */
export async function readNotifications(
  request: APIRequestContext,
  token: string,
  query = '',
): Promise<NotificationItem[]> {
  const result = await call<List<NotificationItem>>(request, 'GET', `/api/notifications?pageSize=100${query}`, token)
  expect(result.status, `GET /api/notifications ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

// --- Club-zone calendar and wall time ---

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export type WeekdayCode = (typeof WEEKDAY_CODES)[number]

/** `YYYY-MM-DD` plus `days` (calendar arithmetic, no time zone involved). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

export function weekdayOf(date: string): WeekdayCode {
  return WEEKDAY_CODES[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

/** The first `weekday` on or after `date`. */
export function nextWeekday(date: string, weekday: WeekdayCode): string {
  let day = date
  while (weekdayOf(day) !== weekday) day = addDays(day, 1)
  return day
}

/** Every `weekday` in the inclusive range. */
export function weekdaysBetween(from: string, to: string, weekday: WeekdayCode): string[] {
  const days: string[] = []
  for (let day = nextWeekday(from, weekday); day <= to; day = addDays(day, 7)) days.push(day)
  return days
}

function zoneParts(instant: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

/** The club zone's UTC offset at an instant, in minutes (60 in winter, 120 in summer time). */
export function zoneOffsetMinutes(instant: string | Date, timeZone = CLUB_ZONE): number {
  const at = typeof instant === 'string' ? new Date(instant) : instant
  const parts = zoneParts(at, timeZone)
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return Math.round((asUtc - at.getTime()) / 60_000)
}

/** The club-zone wall time `HH:mm` of an instant. */
export function wallTime(instant: string, timeZone = CLUB_ZONE): string {
  const parts = zoneParts(new Date(instant), timeZone)
  return `${parts.hour}:${parts.minute}`
}

/** The club-zone calendar date of an instant. */
export function zoneDate(instant: string, timeZone = CLUB_ZONE): string {
  const parts = zoneParts(new Date(instant), timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** The ISO instant of a club-zone date and wall time `HH:mm`. */
export function zoneInstant(date: string, time: string, timeZone = CLUB_ZONE): string {
  const naive = Date.parse(`${date}T${time}:00Z`)
  const first = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000
  return new Date(naive - zoneOffsetMinutes(new Date(first), timeZone) * 60_000).toISOString()
}

/** The `UNTIL` value of "until 30 June next year" (`YYYYMMDD`) and the same day as `YYYY-MM-DD`. */
export function juneThirtiethNextYear(today: string): { until: string; date: string } {
  const year = Number(today.slice(0, 4)) + 1
  return { until: `${String(year)}0630`, date: `${String(year)}-06-30` }
}
