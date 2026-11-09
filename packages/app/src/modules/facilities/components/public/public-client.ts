// Client pieces of the public facility pages `/p/[clubSlug]/places` (P-03) and `/p/[clubSlug]/places/[placeSlug]`
// (P-04; facilities spec REQ-014, #124): the queries of `GET /api/facilities/public/…`, their load result — which tells
// an unknown club or place (404 `public_place_not_found`) from a club that does not share its facility calendars (404
// `public_places_disabled`) and from a failed request — and the formatting of what the month shows. The response
// shapes are the service's own types; nothing here adds data the API did not send. Also the sessionless request
// calls of P-04 and P-05 (#125), which answer an outcome instead of throwing.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { OpeningHours } from '@vereino/core'
import type { PublicSlot, PublicSlotState } from '../../lib/public-schedule'
import type { PublicPlacesView, PublicScheduleDay, PublicScheduleView } from '../../services/public-schedule'

export type { PublicPlacesView, PublicScheduleDay, PublicScheduleView, PublicSlot, PublicSlotState, OpeningHours }

export type PublicFacilitiesLoad<T> =
  { status: 'ok'; page: T } | { status: 'not_found' } | { status: 'disabled' } | { status: 'month_invalid' }

/** The states in the order the legend lists them: the free ones first, then the taken ones. */
export const LEGEND_STATES: readonly PublicSlotState[] = [
  'public_free',
  'bookable',
  'club_training',
  'club',
  'booked',
  'requested',
  'closed',
]

/** The status token family of a state: an extra cue next to its label, never the only one. */
export const STATE_TONE: Record<PublicSlotState, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  public_free: 'success',
  bookable: 'warning',
  club_training: 'info',
  club: 'neutral',
  booked: 'neutral',
  requested: 'neutral',
  closed: 'error',
  unavailable: 'error',
}

/** Static class names per tone, so Tailwind emits them. */
export const TONE_CLASSES: Record<(typeof STATE_TONE)[PublicSlotState], string> = {
  success: 'border-status-success-border bg-status-success-bg text-status-success-text',
  info: 'border-status-info-border bg-status-info-bg text-status-info-text',
  warning: 'border-status-warning-border bg-status-warning-bg text-status-warning-text',
  error: 'border-status-error-border bg-status-error-bg text-status-error-text',
  neutral: 'border-status-neutral-border bg-status-neutral-bg text-status-neutral-text',
}

export const clubHref = (clubSlug: string): string => `/p/${encodeURIComponent(clubSlug)}`

export const placesHref = (clubSlug: string): string => `${clubHref(clubSlug)}/places`

export const placeHref = (clubSlug: string, placeSlug: string, month?: string | null): string =>
  `${placesHref(clubSlug)}/${encodeURIComponent(placeSlug)}${month ? `?month=${encodeURIComponent(month)}` : ''}`

async function loadPublic<T>(url: string): Promise<PublicFacilitiesLoad<T>> {
  const call = await apiCall<T & { code?: string }>(url)
  if (call.ok && call.result) return { status: 'ok', page: call.result }
  if (call.status === 404)
    return call.result?.code === 'public_places_disabled' ? { status: 'disabled' } : { status: 'not_found' }
  // A month outside the readable range (a stale permalink): the page offers the current month instead.
  if (call.status === 400 && call.result?.code === 'public_schedule_month_invalid') return { status: 'month_invalid' }
  throw new Error(`[internal] public facilities request failed with ${String(call.status)}`)
}

export function usePublicPlaces(clubSlug: string) {
  return useQuery({
    queryKey: ['facilities-public-places', clubSlug],
    queryFn: () => loadPublic<PublicPlacesView>(`/api/facilities/public/${encodeURIComponent(clubSlug)}/places`),
    retry: false,
  })
}

export function usePublicSchedule(clubSlug: string, placeSlug: string, month: string | null) {
  return useQuery({
    queryKey: ['facilities-public-schedule', clubSlug, placeSlug, month ?? ''],
    queryFn: () =>
      loadPublic<PublicScheduleView>(
        `/api/facilities/public/${encodeURIComponent(clubSlug)}/places/${encodeURIComponent(placeSlug)}/schedule${
          month ? `?month=${encodeURIComponent(month)}` : ''
        }`,
      ),
    retry: false,
    // The shown month stays on screen while the next one loads.
    placeholderData: (previous) => previous,
  })
}

/** A `YYYY-MM` of the URL, or null when absent or malformed (the API then shows the current month). */
export function monthParam(value: string | null): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null
}

export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

const utcDate = (date: string): Date => new Date(`${date}T00:00:00Z`)

/** "November 2026" / "listopad 2026". */
export function formatMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    utcDate(`${month}-01`),
  )
}

/** "Wednesday, 18 November" in the reader's locale. */
export function formatDayHeading(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    utcDate(date),
  )
}

/** The ISO weekday (1 = Monday … 7 = Sunday) of a calendar date. */
export function isoWeekday(date: string): number {
  const day = utcDate(date).getUTCDay()
  return day === 0 ? 7 : day
}

/** The reader's short (or long) name of an ISO weekday. */
export function weekdayName(weekday: number, locale: string, style: 'short' | 'long' = 'short'): string {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, weekday)),
  )
}

/** A season bound `MM-DD` as "1 April" (a leap year, so `02-29` reads). */
export function formatMonthDay(monthDay: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    utcDate(`2024-${monthDay}`),
  )
}

/** A whole-day stretch: 00:00 to midnight. */
export const isAllDay = (slot: { from: string; to: string }): boolean =>
  slot.from === '00:00' && (slot.to === '24:00' || slot.to === '00:00')

/** `HH:MM`–`HH:MM`; a window ending at midnight ends at 24:00. */
export function timeRange(slot: { from: string; to: string }): string {
  return `${slot.from}–${slot.to === '00:00' ? '24:00' : slot.to}`
}

/** An amount in minor units in the reader's locale, without the grosz when it is whole (`12000` → "120 zł"). */
export function formatAmount(minor: number, currency: string, locale: string): string {
  const whole = minor % 100 === 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100)
}

/** Whether a day has anything to show: a stretch, or "closed all day". */
export const dayHasContent = (day: PublicScheduleDay): boolean =>
  day.slots.length > 0 || (day.opening !== null && day.opening.length === 0)

// --- Online requests (P-04, P-05; #125) ---

/** The body of `POST …/places/{placeSlug}/requests` (`publicRequestSchema`). */
export type PublicRequestBody = {
  startsAt: string
  units: number
  renterDisplayName: string
  renterCategory: 'municipal_club' | 'external_commercial'
  contactName: string
  contactPhone: string
  contactEmail: string
  purpose: string | null
  regulationsAccepted: boolean
  locale: string
  website: string
}

/**
 * What a sent request came to: the e-mail is on its way; the slot is taken (409); the place takes no requests (403);
 * a field or the form is wrong (422 with the field the API named, or 400); too many requests (429); anything else.
 */
export type PublicRequestOutcome =
  | { status: 'sent' }
  | { status: 'taken' }
  | { status: 'not_accepted' }
  | { status: 'invalid'; code: string | null; field: string | null }
  | { status: 'too_many' }
  | { status: 'failed' }

type CodedBody = { code?: unknown; fieldErrors?: unknown }

/** A guest has no session: a 401 or 403 is an answer to show, never a reason to redirect to the staff sign-in. */
const GUEST_HEADERS = {
  'content-type': 'application/json',
  'x-om-unauthorized-redirect': '0',
  'x-om-forbidden-redirect': '0',
}

function firstField(body: CodedBody | null): string | null {
  const fields = body?.fieldErrors
  if (!fields || typeof fields !== 'object') return null
  return Object.keys(fields).at(0) ?? null
}

/** Sends a guest's request without a session; never throws for an answer of the API. */
export async function submitPublicRequest(
  clubSlug: string,
  placeSlug: string,
  body: PublicRequestBody,
): Promise<PublicRequestOutcome> {
  const call = await apiCall<CodedBody>(
    `/api/facilities/public/${encodeURIComponent(clubSlug)}/places/${encodeURIComponent(placeSlug)}/requests`,
    { method: 'POST', headers: GUEST_HEADERS, body: JSON.stringify(body) },
  )
  if (call.ok) return { status: 'sent' }
  const code = typeof call.result?.code === 'string' ? call.result.code : null
  if (call.status === 409) return { status: 'taken' }
  if (call.status === 403 || call.status === 404) return { status: 'not_accepted' }
  if (call.status === 422 || call.status === 400) return { status: 'invalid', code, field: firstField(call.result) }
  if (call.status === 429) return { status: 'too_many' }
  return { status: 'failed' }
}

/** `POST /api/facilities/public/requests/verify` → 200. */
export type RequestSummary = {
  status: 'pending_approval'
  placeName: string
  startsAt: string
  endsAt: string
  timeZone: string
  units: number
  amount: number | null
  currency: string
  holdExpiresAt: string
}

export type VerifyOutcome =
  | { status: 'ok'; summary: RequestSummary }
  | { status: 'expired' }
  | { status: 'taken' }
  | { status: 'too_many' }
  | { status: 'failed' }

/** Confirms a request with the e-mailed token, sent in the body (never in a URL the server logs). */
export async function verifyPublicRequest(token: string): Promise<VerifyOutcome> {
  const call = await apiCall<RequestSummary>('/api/facilities/public/requests/verify', {
    method: 'POST',
    headers: GUEST_HEADERS,
    body: JSON.stringify({ token }),
  })
  if (call.ok && call.result) return { status: 'ok', summary: call.result }
  // An unknown, used or expired link (410), or a malformed one (400), reads the same: the link no longer works.
  if (call.status === 410 || call.status === 400 || call.status === 404) return { status: 'expired' }
  if (call.status === 409) return { status: 'taken' }
  if (call.status === 429) return { status: 'too_many' }
  return { status: 'failed' }
}

/** "Wednesday, 18 November 2026, 13:00–14:30" in the club's zone and the reader's locale. */
export function zonedSlotLabel(startsAt: string, endsAt: string, timeZone: string, locale: string): string {
  const day = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${day.format(new Date(startsAt))}, ${time.format(new Date(startsAt))}–${time.format(new Date(endsAt))}`
}

/** "18 November 2026, 19:30" in the club's zone and the reader's locale. */
export function zonedInstantLabel(instant: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant))
}
