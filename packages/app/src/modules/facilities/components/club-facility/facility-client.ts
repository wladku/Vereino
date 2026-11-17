// The typed client of `/club/facility` (README M-12 "Today at the facility"; REQ-013, REQ-016; #126): the shape of
// `GET /api/facilities/today`, the writes the attendant runs (open and close the facility, today's groups, an
// incident, a rental's no-show — each update with its version as the platform's optimistic-lock token), the wall time
// of the club's zone and the message of a refused write. The facilities parity spec (#282, REQ-R13, REQ-R14) adds the
// tabs, the rows' place, group, coach and contact, today's incidents and the Rentals tab's list. Authorization stays on
// the routes and commands; these helpers only hide what the server would refuse.
import { useQuery } from '@tanstack/react-query'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { zonedInstant } from '@vereino/core'
import { errorCodes } from '../../lib/error-codes'
import type { IncidentAction, IncidentKind } from '../../lib/incidents'
import { timeOf, zoneWallTime, type Translate } from '../club-places/places-client'
import { RENTALS_KEY, type RentalRow } from '../rentals-client'

export const CLUB_FACILITY_HREF = '/club/facility'

/** The tabs of `/club/facility` (M-12, #282): Today for every attendant, Rentals with `facilities.rentals.manage`. */
export const FACILITY_TABS = ['today', 'rentals'] as const
export type FacilityTab = (typeof FACILITY_TABS)[number]

/** The tab the address names; Today for anything else. */
export function facilityTabOf(value: string | null): FacilityTab {
  return value === 'rentals' ? 'rentals' : 'today'
}

/** `/club/facility` with the place and the tab in the address (Today, the default, is not written). */
export function facilityHref(placeId?: string | null, tab: FacilityTab = 'today'): string {
  const params = new URLSearchParams()
  if (tab !== 'today') params.set('tab', tab)
  if (placeId) params.set('place', placeId)
  const query = params.toString()
  return query ? `${CLUB_FACILITY_HREF}?${query}` : CLUB_FACILITY_HREF
}

/** The rental on the phone (#282). */
export function clubRentalHref(id: string): string {
  return `${CLUB_FACILITY_HREF}/rentals/${encodeURIComponent(id)}`
}

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
  /** The entry's place, a session's group and coach; a rental's contact where the caller manages its rentals (#275). */
  placeName: string | null
  groupName: string | null
  coachName: string | null
  contactName: string | null
  contactPhone: string | null
  status: string
  updatedAt: string | null
  canNoShow: boolean
}

/** An incident reported today on the place family: no description, no persons (#275). */
export type TodayIncident = { id: string; occurredAt: string; kind: IncidentKind; photoCount: number }

export type FacilityToday = {
  timeZone: string
  date: string
  places: Array<{ id: string; name: string; parentName: string | null }>
  place: { id: string; name: string } | null
  log: TodayLog | null
  entries: TodayEntry[]
  incidents: TodayIncident[]
}

/** The rental statuses "No-show" is offered from (glossary *Rental statuses*). */
const NO_SHOW_FROM = new Set(['requested', 'confirmed'])

/** Whether a rental card offers "No-show": always while the rental holds its slot, before its start too (M-12). */
export function offersNoShow(entry: Pick<TodayEntry, 'kind' | 'status'>): boolean {
  return entry.kind === 'rental' && NO_SHOW_FROM.has(entry.status)
}

/** True before the rental starts: "No-show" then answers `tooEarly` without calling the API (M-12). */
export function noShowTooEarly(entry: Pick<TodayEntry, 'start'>, now: Date): boolean {
  return now.getTime() < new Date(entry.start).getTime()
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

// --- The attendant's rentals (#282) ---

/** The filters of the Rentals tab: Active (requested, confirmed), To be moved, All. */
export const RENTAL_FILTERS = ['active', 'to_move', 'all'] as const
export type RentalFilter = (typeof RENTAL_FILTERS)[number]

export function rentalFilterOf(value: string | null): RentalFilter {
  return RENTAL_FILTERS.find((entry) => entry === value) ?? 'active'
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The window of the Rentals tab: rentals starting from 7 days back to 30 days ahead. */
export function rentalsWindow(now: Date): { from: string; to: string } {
  return {
    from: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
    to: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
  }
}

/** The list query of a filter (the list route answers within the caller's rental scope). */
export function rentalsQuery(filter: RentalFilter, now: Date): string {
  const params = new URLSearchParams({ ...rentalsWindow(now), sortField: 'startsAt', sortDir: 'asc', pageSize: '200' })
  if (filter === 'active') params.set('tab', 'active')
  if (filter === 'to_move') params.set('view', 'to_move')
  return params.toString()
}

/** The rentals of the attendant's places for one filter, under the shared rentals key (writes invalidate it). */
export function useFacilityRentals(filter: RentalFilter) {
  return useQuery({
    queryKey: [RENTALS_KEY, 'club-facility', filter],
    queryFn: async (): Promise<RentalRow[]> => {
      const call = await apiCall<{ items?: RentalRow[] }>(`${RENTALS_URL}?${rentalsQuery(filter, new Date())}`, {
        headers: OWN_FORBIDDEN,
      })
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result.items ?? []
    },
  })
}

const FEATURES = ['facilities.rentals.manage', 'facilities.log.write', 'facilities.manage'] as const

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

/**
 * Whether the signed-in user may record a rental's no-show and see the Rentals tab (`facilities.rentals.manage`), keep
 * the facility log (`facilities.log.write`, the link to this page from `/club/places`), and manage the club's
 * facilities (`facilities.manage`: an empty place list then means the club has none, not that none was assigned).
 */
export function useFacilityFeatures(): { noShow: boolean; logWrite: boolean; manage: boolean; loaded: boolean } {
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
  return {
    noShow: grants(granted, 'facilities.rentals.manage'),
    logWrite: grants(granted, 'facilities.log.write'),
    manage: grants(granted, 'facilities.manage'),
    loaded: query.data !== undefined,
  }
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
