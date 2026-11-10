// The typed client of `/club/facility` (README M-12 "Today at the facility"; REQ-013, REQ-016; #126): the shape of
// `GET /api/facilities/today`, the writes the attendant runs (open and close the facility, today's groups, an
// incident, a rental's no-show — each update with its version as the platform's optimistic-lock token), the wall time
// of the club's zone and the message of a refused write. Authorization stays on the routes and commands; these
// helpers only hide what the server would refuse.
import { useQuery } from '@tanstack/react-query'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { zonedInstant } from '@vereino/core'
import { errorCodes } from '../../lib/error-codes'
import type { IncidentAction, IncidentKind } from '../../lib/incidents'
import { timeOf, zoneWallTime, type Translate } from '../club-places/places-client'

export const CLUB_FACILITY_HREF = '/club/facility'
export const facilityHref = (placeId?: string | null) =>
  placeId ? `${CLUB_FACILITY_HREF}?place=${encodeURIComponent(placeId)}` : CLUB_FACILITY_HREF

export const TODAY_URL = '/api/facilities/today'
export const LOGS_URL = '/api/facilities/logs'
export const INCIDENTS_URL = '/api/facilities/incidents'
export const RENTALS_URL = '/api/facilities/rentals'

/** The query key prefix of the day's read, invalidated after every write. */
export const FACILITY_TODAY_KEY = 'facilities-club-today'

/** A coded refusal does not send the attendant to the sign-in page; the page shows it instead. */
const OWN_FORBIDDEN: Record<string, string> = { 'x-om-forbidden-redirect': '0' }

export type GroupPresent = {
  occurrenceId?: string | null
  rentalId?: string | null
  headcount: number
  adultSupervisorPresent: boolean
}

export type TodayLog = {
  id: string
  updatedAt: string
  openedAt: string | null
  closedAt: string | null
  conditionBefore: string | null
  conditionAfter: string | null
  groupsPresent: GroupPresent[]
  remarks: string | null
}

export type TodayEntry = {
  kind: 'session' | 'rental'
  id: string
  placeId: string
  start: string
  end: string
  label: string | null
  status: string
  updatedAt: string | null
  canNoShow: boolean
}

export type FacilityToday = {
  timeZone: string
  date: string
  places: Array<{ id: string; name: string; parentName: string | null }>
  place: { id: string; name: string } | null
  log: TodayLog | null
  entries: TodayEntry[]
}

// --- Wall time in the club's zone ---

/** `HH:MM` of an instant in the club's zone; '' when there is none. */
export function clubTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return timeOf(zoneWallTime(at, timeZone).minutes)
}

/** The current `HH:MM` in the club's zone. */
export function clubTimeNow(timeZone: string): string {
  return timeOf(zoneWallTime(new Date(), timeZone).minutes)
}

/** A wall time of `date` in the club's zone as an ISO instant; null when the time is not `HH:MM`. */
export function clubInstant(date: string, time: string, timeZone: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null
  const at = zonedInstant(date, time, timeZone)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** "17:00–18:30" of an entry in the club's zone. */
export function entryTimes(entry: Pick<TodayEntry, 'start' | 'end'>, timeZone: string): string {
  return `${clubTime(entry.start, timeZone)}–${clubTime(entry.end, timeZone)}`
}

// --- Today's groups ---

/** The group of the log that names `entry`, or null. */
export function groupOf(log: TodayLog | null, entry: Pick<TodayEntry, 'kind' | 'id'>): GroupPresent | null {
  if (!log) return null
  return (
    log.groupsPresent.find((group) =>
      entry.kind === 'session' ? group.occurrenceId === entry.id : group.rentalId === entry.id,
    ) ?? null
  )
}

/** The log's groups with the one of `entry` replaced (or added), in the API's shape. */
export function groupsWith(
  log: TodayLog | null,
  entry: Pick<TodayEntry, 'kind' | 'id'>,
  headcount: number,
  adultSupervisorPresent: boolean,
): GroupPresent[] {
  const others = (log?.groupsPresent ?? []).filter((group) =>
    entry.kind === 'session' ? group.occurrenceId !== entry.id : group.rentalId !== entry.id,
  )
  const own: GroupPresent =
    entry.kind === 'session'
      ? { occurrenceId: entry.id, headcount, adultSupervisorPresent }
      : { rentalId: entry.id, headcount, adultSupervisorPresent }
  return [
    ...others.map((group) => ({
      ...(group.occurrenceId ? { occurrenceId: group.occurrenceId } : { rentalId: group.rentalId ?? null }),
      headcount: group.headcount,
      adultSupervisorPresent: group.adultSupervisorPresent,
    })),
    own,
  ]
}

// --- Reads ---

export function useFacilityToday(placeId: string | null) {
  return useQuery({
    queryKey: [FACILITY_TODAY_KEY, placeId ?? 'first'],
    queryFn: async (): Promise<FacilityToday> => {
      const params = placeId ? `?${new URLSearchParams({ placeId }).toString()}` : ''
      const call = await apiCall<FacilityToday>(`${TODAY_URL}${params}`, { headers: OWN_FORBIDDEN })
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
}

const FEATURES = ['facilities.rentals.manage', 'facilities.log.write'] as const

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

/**
 * Whether the signed-in user may record a rental's no-show (`facilities.rentals.manage`) and keep the facility log
 * (`facilities.log.write`, the link to this page from `/club/places`).
 */
export function useFacilityFeatures(): { noShow: boolean; logWrite: boolean } {
  const query = useQuery({
    queryKey: ['feature-check', ...FEATURES],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const call = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: FEATURES }),
      })
      return call.ok && Array.isArray(call.result?.granted) ? call.result.granted.map(String) : []
    },
  })
  const granted = query.data ?? []
  return { noShow: grants(granted, 'facilities.rentals.manage'), logWrite: grants(granted, 'facilities.log.write') }
}

// --- Writes ---

export type ApiAnswer = {
  id?: string
  updatedAt?: string
  code?: string
  error?: string
  field?: string
  fieldErrors?: Record<string, string>
}

export type WriteResult = { ok: boolean; status: number; answer: ApiAnswer }

async function send(url: string, init: RequestInit): Promise<WriteResult> {
  try {
    const call = await apiCall<ApiAnswer>(url, init)
    return { ok: call.ok, status: call.status, answer: call.result ?? {} }
  } catch {
    return { ok: false, status: 0, answer: {} }
  }
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { ...OWN_FORBIDDEN, 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export type LogFields = {
  openedAt?: string | null
  closedAt?: string | null
  conditionBefore?: string | null
  conditionAfter?: string | null
  groupsPresent?: GroupPresent[]
  remarks?: string | null
}

/** Starts the day's log of a place (`POST /api/facilities/logs`). */
export function createLog(input: { placeId: string; logDate: string } & LogFields): Promise<WriteResult> {
  return send(LOGS_URL, json('POST', input))
}

/** Changes the given fields of a log with its version as the lock token (`PUT /api/facilities/logs`). */
export function updateLog(log: Pick<TodayLog, 'id' | 'updatedAt'>, fields: LogFields): Promise<WriteResult> {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(log.updatedAt), () =>
    send(LOGS_URL, json('PUT', { id: log.id, ...fields })),
  )
}

/** Writes the log fields: an update of the day's log, or its start when the day has none yet. */
export function saveLog(today: FacilityToday, fields: LogFields): Promise<WriteResult> {
  if (today.log) return updateLog(today.log, fields)
  return createLog({ placeId: today.place?.id ?? '', logDate: today.date, ...fields })
}

export type IncidentInput = {
  placeId: string
  occurredAt: string
  kind: IncidentKind
  description: string
  involved: string | null
  actionTaken: IncidentAction[]
}

export function reportIncident(input: IncidentInput): Promise<WriteResult> {
  return send(INCIDENTS_URL, json('POST', input))
}

/** Adds one photo to a reported incident (`POST /api/facilities/incidents/{id}/photos`, multipart, #126). */
export function uploadIncidentPhoto(incidentId: string, file: File): Promise<WriteResult> {
  const body = new FormData()
  body.append('file', file)
  return send(`${INCIDENTS_URL}/${encodeURIComponent(incidentId)}/photos`, {
    method: 'POST',
    headers: OWN_FORBIDDEN,
    body,
  })
}

/** Records a rental's no-show with its version as the lock token. */
export function recordNoShow(entry: Pick<TodayEntry, 'id' | 'updatedAt'>): Promise<WriteResult> {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(entry.updatedAt ?? null), () =>
    send(`${RENTALS_URL}/${encodeURIComponent(entry.id)}/no-show`, json('POST', {})),
  )
}

// --- Messages ---

const OWN_CODES = new Set<string>(errorCodes.map((entry) => entry.code))

/** True when the write was refused because the record changed meanwhile (a stale lock token or a log started). */
export function isConflict(result: WriteResult): boolean {
  return result.status === 409 && (result.answer.code === undefined || !OWN_CODES.has(result.answer.code))
}

/** The message of a refused write: the module's coded error, a conflict, a denial, or the fallback. */
export function writeErrorMessage(t: Translate, result: WriteResult, fallbackKey: string): string {
  const code = result.answer.code
  if (code && OWN_CODES.has(code)) return t(`facilities.errors.${code}`)
  if (code === 'invalid_transition') return t('facilities.rentals.errors.invalid_transition')
  if (result.status === 409) return t('facilities.facility.errors.conflict')
  if (result.status === 403) return t('facilities.facility.errors.denied')
  return t(fallbackKey)
}
