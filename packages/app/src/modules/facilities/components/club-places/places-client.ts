// The typed client of the staff facility pages `/club/places` and `/club/places/[placeId]` (README M-11; REQ-023,
// REQ-027; #123): the shape of `GET /api/facilities/calendar`, the reads and writes the pages run (the calendar, the
// booking options, the feature check, an internal booking, its cancellation with the lock token, a group's event),
// the wall-time handling in the club's time zone (`Intl`, never the browser's zone) and the cutting of a day into the
// timeline segments of 08:00–22:00. Planned maintenance windows (#128) are entries of their own; a place maintainer
// without `facilities.view` reads the calendar redacted (`maintenance.redacted`: the other entries without names), and
// `maintenance.canPlan` / `planPlaceIds` say where "Plan maintenance" applies. Authorization stays on the routes and commands; these helpers only hide what the
// server would refuse.
import { useQuery } from '@tanstack/react-query'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import { addDays, isCalendarDate, isLocalTime, zonedInstant } from '@vereino/core'
import { MAINTENANCE_KINDS } from '../../lib/maintenance'
import type { Zone } from '../../lib/zones'

export type Translate = ReturnType<typeof useT>

export const CLUB_PLACES_HREF = '/club/places'
export const placeHref = (placeId: string, date?: string) =>
  `${CLUB_PLACES_HREF}/${encodeURIComponent(placeId)}${date ? `?date=${encodeURIComponent(date)}` : ''}`

export const CALENDAR_URL = '/api/facilities/calendar'
export const INTERNAL_BOOKINGS_URL = '/api/facilities/internal-bookings'
export const BOOKING_OPTIONS_URL = '/api/facilities/internal-bookings/options'
export const EVENTS_URL = '/api/activities/events'
export const EVENT_OPTIONS_URL = '/api/activities/events/options'

/** The query key prefix of every calendar read, invalidated after a booking or a cancellation. */
export const PLACES_CALENDAR_KEY = 'facilities-club-calendar'

/** A coded refusal does not send a staff member to the sign-in page; the page shows it instead. */
const OWN_FORBIDDEN: Record<string, string> = { 'x-om-forbidden-redirect': '0' }

/** The event types a group's booking offers and the name limit, as `activities`' `eventCreateSchema` sets them. */
export const EVENT_TYPES = ['tournament', 'other'] as const
export const EVENT_NAME_MAX = 200

/** The purpose limits of `internalBookingCreateSchema`. */
export const PURPOSE_MIN = 3
export const PURPOSE_MAX = 120

/** The timeline's day: 08:00–22:00 in the club's zone, in minutes after midnight. */
export const DAY_START = 8 * 60
export const DAY_END = 22 * 60

export type CalendarEntryKind = 'session' | 'rental' | 'request' | 'booking' | 'closure' | 'maintenance'
export const ENTRY_KINDS: readonly CalendarEntryKind[] = [
  'session',
  'booking',
  'rental',
  'request',
  'closure',
  'maintenance',
]

export type CalendarPlace = { id: string; name: string; parentName: string | null; isLeaf: boolean }
export type CalendarDay = {
  date: string
  opening: Array<{ from: string; to: string }> | null
  zones: Array<{ from: string; to: string; zone: Zone }>
}
export type CalendarEntry = {
  id: string
  kind: CalendarEntryKind
  placeId: string
  start: string
  end: string
  label: string | null
  needsReschedule: boolean
  groupId: string | null
  sectionId: string | null
  bookedByName: string | null
  own: boolean
  canCancel: boolean
  /** An internal booking's or a maintenance task's version, the lock token of its change. */
  updatedAt?: string | null
}
/** The caller's maintenance access (#128): a redacted reader, and where maintenance may be planned (null = everywhere). */
export type CalendarMaintenanceAccess = { redacted: boolean; canPlan: boolean; planPlaceIds: string[] | null }
export type StaffCalendar = {
  timeZone: string
  maintenance?: CalendarMaintenanceAccess
  places: CalendarPlace[]
  days: CalendarDay[]
  entries: CalendarEntry[]
}

export type BookingSection = { id: string; name: string; coordinated: boolean }

/** A colliding entry of a 409 `rental_conflict` / `place_closed`. */
export type BookingConflict = {
  kind: 'session' | 'rental' | 'booking' | 'closure' | 'maintenance'
  id: string
  placeId?: string
  start: string
  end: string
  label?: string | null
}

// --- Wall time in the club's zone ---

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    partsFormatters.set(timeZone, formatter)
  }
  return formatter
}

/** The club-zone calendar date and the minutes after its midnight of an instant. */
export function zoneWallTime(at: Date, timeZone: string): { date: string; minutes: number } {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  }
}

/** The minutes of an instant on `date` of the club's zone: 0 before the day, 1440 after it. */
export function minutesOnDate(iso: string, date: string, timeZone: string): number {
  const wall = zoneWallTime(new Date(iso), timeZone)
  if (wall.date < date) return 0
  if (wall.date > date) return 24 * 60
  return wall.minutes
}

/** `HH:MM` → minutes; `24:00` is the end of the day. */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Minutes → `HH:MM`. */
export function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** The window of one club-zone day as instants (`from` inclusive, `to` exclusive). */
export function dayWindow(date: string, timeZone: string): { from: string; to: string } {
  return {
    from: zonedInstant(date, '00:00', timeZone).toISOString(),
    to: zonedInstant(addDays(date, 1), '00:00', timeZone).toISOString(),
  }
}

/** "Sat" of a calendar date in the interface locale. */
export function shortWeekday(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

/** "9:00–12:00": the hours without a leading zero, as the booking message reads. */
export function compactRange(fromTime: string, toTime: string): string {
  const compact = (time: string) => time.replace(/^0(\d)/, '$1')
  return `${compact(fromTime)}–${compact(toTime)}`
}

/** `HH:MM–HH:MM` of an entry in the club's zone. */
export function entryRange(entry: { start: string; end: string }, timeZone: string): string {
  return `${timeOf(zoneWallTime(new Date(entry.start), timeZone).minutes)}–${timeOf(zoneWallTime(new Date(entry.end), timeZone).minutes)}`
}

// --- The day's timeline ---

export type SegmentEntry = { entry: CalendarEntry; first: boolean }
export type TimelineSegment = {
  from: number
  to: number
  zone: Zone | null
  /** Inside the opening hours (always, when the day has no opening-hours limit). */
  open: boolean
  entries: SegmentEntry[]
}

/**
 * Cuts 08:00–22:00 of a day at every zone, opening and entry boundary. Each segment carries its zone, whether the
 * place is open and the entries occupying it (`first` marks the segment an entry starts in, where its block and
 * actions are shown; later segments name it as continuing).
 */
export function daySegments(
  day: CalendarDay | null,
  entries: readonly CalendarEntry[],
  date: string,
  timeZone: string,
): TimelineSegment[] {
  const clip = (minutes: number) => Math.min(DAY_END, Math.max(DAY_START, minutes))
  const placed = entries
    .map((entry) => ({
      entry,
      from: minutesOnDate(entry.start, date, timeZone),
      to: minutesOnDate(entry.end, date, timeZone),
    }))
    .filter((item) => item.to > DAY_START && item.from < DAY_END && item.to > item.from)
  const zones = (day?.zones ?? []).map((zone) => ({
    from: minutesOf(zone.from),
    to: minutesOf(zone.to),
    zone: zone.zone,
  }))
  const opening = day?.opening
    ? day.opening.map((window) => ({ from: minutesOf(window.from), to: minutesOf(window.to) }))
    : null
  const cuts = new Set<number>([DAY_START, DAY_END])
  for (const item of [...placed, ...zones, ...(opening ?? [])]) {
    cuts.add(clip(item.from))
    cuts.add(clip(item.to))
  }
  const points = [...cuts].sort((a, b) => a - b)
  const segments: TimelineSegment[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const zone = zones.filter((entry) => entry.from <= from && entry.to >= to).pop()?.zone ?? null
    const open = opening === null || opening.some((window) => window.from <= from && window.to >= to)
    segments.push({
      from,
      to,
      zone,
      open,
      entries: placed
        .filter((item) => item.from < to && item.to > from)
        .map((item) => ({ entry: item.entry, first: clip(item.from) === from })),
    })
  }
  return segments
}

/** A segment the user may pick as a free range: open, not a closed zone and with nothing on it. */
export function isFreeSegment(segment: TimelineSegment): boolean {
  return segment.open && segment.zone !== 'closed' && segment.entries.length === 0
}

/** The entries of one place on a club-zone day, by start. */
export function entriesOfDay(
  entries: readonly CalendarEntry[],
  date: string,
  timeZone: string,
  placeId?: string,
): CalendarEntry[] {
  return entries
    .filter((entry) => !placeId || entry.placeId === placeId)
    .filter(
      (entry) => minutesOnDate(entry.end, date, timeZone) > 0 && minutesOnDate(entry.start, date, timeZone) < 24 * 60,
    )
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
}

const REDACTED_KEYS: Record<string, string> = {
  session: 'facilities.places.redacted.club',
  booking: 'facilities.places.redacted.club',
  rental: 'facilities.places.redacted.booked',
  request: 'facilities.places.redacted.requested',
  closure: 'facilities.places.redacted.closed',
}

/** A maintenance entry's kind of work in words; a conflict's label may carry " · planner" after the kind. */
function maintenanceLabel(t: Translate, label: string | null | undefined): string {
  if (!label) return t('facilities.places.kind.maintenance')
  const [kind, ...rest] = label.split(' · ')
  const known = MAINTENANCE_KINDS.find((entry) => entry === kind)
  if (!known) return label
  return [t(`facilities.maintenance.kinds.${known}`), ...rest].join(' · ')
}

/**
 * The text of an entry: an activity, a renter, a booking purpose, a closure's reason or the kind of maintenance work.
 * A redacted reader (a place maintainer) sees what occupies the slot, never who: "Taken by the club", "Booked", …
 */
export function entryLabel(t: Translate, entry: { kind: string; label?: string | null }, redacted = false): string {
  if (entry.kind === 'maintenance') return maintenanceLabel(t, entry.label)
  const redactedKey = redacted ? REDACTED_KEYS[entry.kind] : undefined
  if (redactedKey) return t(redactedKey)
  if (entry.kind === 'closure') {
    return entry.label ? t(`facilities.closures.reason.${entry.label}`) : t('facilities.places.kind.closure')
  }
  return entry.label ?? t('facilities.places.entry.unnamed')
}

// --- Reads ---

/** The HTTP status a failed calendar read carries (`useStaffCalendar` throws it as the message). */
export function calendarErrorStatus(error: unknown): number | null {
  const status = error instanceof Error ? Number(error.message) : Number.NaN
  return Number.isInteger(status) ? status : null
}

/** Whether the caller may plan maintenance on the place. */
export function canPlanMaintenance(calendar: Pick<StaffCalendar, 'maintenance'>, placeId: string): boolean {
  const access = calendar.maintenance
  if (!access?.canPlan) return false
  return access.planPlaceIds === null || access.planPlaceIds.includes(placeId)
}

/** A `datetime-local` value (`YYYY-MM-DDTHH:MM`) read in the club's zone, as an ISO instant; null when invalid. */
export function zonedLocalInstant(local: string, timeZone: string): string | null {
  const date = local.slice(0, 10)
  const time = local.slice(11, 16)
  if (!isCalendarDate(date) || !isLocalTime(time)) return null
  return zonedInstant(date, time, timeZone).toISOString()
}

/** An instant as a `datetime-local` value in the club's zone; '' when there is none. */
export function zonedLocalValue(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const wall = zoneWallTime(at, timeZone)
  return `${wall.date}T${timeOf(wall.minutes)}`
}

export function useStaffCalendar(window: { from: string; to: string; placeId?: string }) {
  return useQuery({
    queryKey: [PLACES_CALENDAR_KEY, window.placeId ?? 'all', window.from, window.to],
    queryFn: async (): Promise<StaffCalendar> => {
      const params = new URLSearchParams({ from: window.from, to: window.to })
      if (window.placeId) params.set('placeId', window.placeId)
      const call = await apiCall<StaffCalendar>(`${CALENDAR_URL}?${params.toString()}`, { headers: OWN_FORBIDDEN })
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
}

export function useBookingSections(enabled: boolean) {
  return useQuery({
    queryKey: ['facilities-booking-options'],
    enabled,
    queryFn: async (): Promise<BookingSection[]> => {
      const call = await apiCall<{ sections?: BookingSection[] }>(BOOKING_OPTIONS_URL, { headers: OWN_FORBIDDEN })
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result.sections ?? []
    },
  })
}

type ExternalTeamRow = { id: string; name: string | null; clubName: string | null }

/** The external teams a tournament may invite (`GET /api/groups/external-teams`, readable by a coach). */
export async function externalTeams(): Promise<Array<{ value: string; label: string }>> {
  const params = new URLSearchParams({ pageSize: '100', sortField: 'name', sortDir: 'asc' })
  const call = await apiCall<{ items?: ExternalTeamRow[] }>(`/api/groups/external-teams?${params.toString()}`, {
    headers: OWN_FORBIDDEN,
  })
  if (!call.ok || !call.result) throw new Error(String(call.status))
  return (call.result.items ?? []).map((item) => ({
    value: item.id,
    label: item.clubName ? `${item.name ?? item.id} (${item.clubName})` : (item.name ?? item.id),
  }))
}

const FEATURES = ['facilities.bookings.create', 'activities.events.create'] as const

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

/** Whether the signed-in user may book (`facilities.bookings.create`) and create a group's event. */
export function usePlacesFeatures(): { book: boolean; groupEvents: boolean } {
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
    book: grants(granted, 'facilities.bookings.create'),
    groupEvents: grants(granted, 'activities.events.create'),
  }
}

// --- Writes ---

export type ApiAnswer = {
  id?: string
  occurrenceId?: string
  code?: string
  error?: string
  field?: string
  fieldErrors?: Record<string, string>
  conflicts?: unknown
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

export type InternalBookingInput = {
  placeId: string
  startsAt: string
  endsAt: string
  sectionId: string
  purpose: string
}

export function createInternalBooking(input: InternalBookingInput): Promise<WriteResult> {
  return send(INTERNAL_BOOKINGS_URL, {
    method: 'POST',
    headers: { ...OWN_FORBIDDEN, 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function createGroupEvent(body: Record<string, unknown>): Promise<WriteResult> {
  return send(EVENTS_URL, {
    method: 'POST',
    headers: { ...OWN_FORBIDDEN, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Cancels an internal booking with its version as the platform's optimistic-lock token. */
export function cancelInternalBooking(entry: Pick<CalendarEntry, 'id' | 'updatedAt'>): Promise<WriteResult> {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(entry.updatedAt ?? null), () =>
    send(`${INTERNAL_BOOKINGS_URL}/${encodeURIComponent(entry.id)}`, {
      method: 'DELETE',
      headers: { ...OWN_FORBIDDEN, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }),
  )
}

/** The colliding entries a 409 carries, or an empty list. */
export function bookingConflicts(answer: ApiAnswer): BookingConflict[] {
  return Array.isArray(answer.conflicts) ? (answer.conflicts as BookingConflict[]) : []
}

const BOOKING_ERROR_KEYS: Record<string, string> = {
  rental_conflict: 'facilities.places.errors.conflict',
  place_closed: 'facilities.places.errors.closed',
  maintenance_scheduled: 'facilities.places.errors.maintenance',
  booking_period_invalid: 'facilities.places.errors.period',
  booking_start_past: 'facilities.places.errors.past',
  booking_section_invalid: 'facilities.places.errors.section',
  scope_denied: 'facilities.places.errors.denied',
  scope_unlinked: 'facilities.places.errors.denied',
}

/** The message of a refused internal booking. */
export function bookingErrorMessage(t: Translate, result: WriteResult): string {
  const key = result.answer.code ? BOOKING_ERROR_KEYS[result.answer.code] : undefined
  if (key) return t(key)
  if (result.status === 400) return t('facilities.places.errors.purpose')
  if (result.status === 403) return t('facilities.places.errors.denied')
  return t('facilities.places.errors.book')
}
