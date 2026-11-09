// Client-side helpers of the online request queue (facilities spec B-25 and the B-01 widget "Requests awaiting
// approval"; REQ-024; #125): the queue as `GET /api/facilities/rentals/requests` returns it, the approve and reject
// calls with the request's lock token, the time to expiry and the slot in the club's time zone. Authorization stays on
// the routes and commands (`facilities.rentals.approve`).
import { useQuery } from '@tanstack/react-query'
import {
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { timeToExpiry } from '../lib/request-form'
import type { Translate } from './facilities-client'
import { RENTALS_KEY, RENTALS_URL } from './rentals-client'

export const REQUESTS_HREF = '/backend/facilities/requests'
export const REQUESTS_URL = '/api/facilities/rentals/requests'

/** The query key prefix of every queue read (under the rentals prefix, so a rental write refreshes it too). */
export const REQUESTS_KEY = [RENTALS_KEY, 'requests'] as const

export type QueueConflictKind = 'session' | 'rental' | 'booking' | 'closure' | 'request'

export type RequestQueueItem = {
  id: string
  /** The lock token of approve / reject. */
  updatedAt: string
  placeId: string
  placeName: string
  startsAt: string
  endsAt: string
  units: number
  renterDisplayName: string
  renterCategory: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  purpose: string | null
  amount: number | null
  holdExpiresAt: string
  entryBanMatch: boolean
  conflicts: Array<{ kind: QueueConflictKind; start: string; end: string }>
}

export type RequestQueuePage = {
  items: RequestQueueItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  timeZone: string
  currency: string
}

export function useRequestQueue(page: number, pageSize: number, extraKey: unknown[] = [], enabled = true) {
  return useQuery({
    queryKey: [...REQUESTS_KEY, page, pageSize, ...extraKey],
    enabled,
    retry: false,
    queryFn: () =>
      readApiResultOrThrow<RequestQueuePage>(
        `${REQUESTS_URL}?${new URLSearchParams({ page: String(page), pageSize: String(pageSize) }).toString()}`,
      ),
  })
}

/** The approval body (`requestApproveSchema` without the id). */
export type ApproveBody = {
  renterType?: 'institution' | 'person'
  renterId?: string
  createInstitution?: { name: string; type: InstitutionType }
  renterCategory?: string
  amountOverride?: number
  note?: string
}

export const INSTITUTION_TYPES = ['municipality', 'school', 'club', 'company', 'sponsor', 'other'] as const
export type InstitutionType = (typeof INSTITUTION_TYPES)[number]

/** Approves or rejects a request with its lock token; throws the API error (409 conflicts, coded refusals). */
export async function decideRequest(
  item: Pick<RequestQueueItem, 'id' | 'updatedAt'>,
  decision: 'approve' | 'reject',
  body: ApproveBody | { reason: string },
  errorMessage: string,
): Promise<void> {
  await withScopedApiRequestHeaders(buildOptimisticLockHeader(item.updatedAt), () =>
    apiCallOrThrow(
      `${RENTALS_URL}/${encodeURIComponent(item.id)}/${decision}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      { errorMessage },
    ),
  )
}

/** "47 h 15 min" / "20 min" until the hold ends, or "expired". */
export function expiryLabel(t: Translate, holdExpiresAt: string, now: Date): string {
  const left = timeToExpiry(new Date(holdExpiresAt), now)
  if (!left) return t('facilities.requests.expiry.passed')
  return left.hours > 0
    ? t('facilities.requests.expiry.hours', { hours: left.hours, minutes: left.minutes })
    : t('facilities.requests.expiry.minutes', { minutes: left.minutes })
}

/** "Wed, 18.11.2026, 13:00–14:30" in the club's time zone. */
export function queueSlotLabel(startsAt: string, endsAt: string, timeZone: string, locale: string): string {
  const day = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${day.format(new Date(startsAt))}, ${time.format(new Date(startsAt))}–${time.format(new Date(endsAt))}`
}

/** "12:00–13:00" of a conflict in the club's time zone (the same day as the request). */
export function queueTimeRange(start: string, end: string, timeZone: string, locale: string): string {
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${time.format(new Date(start))}–${time.format(new Date(end))}`
}

/** An amount in minor units with the club's currency. */
export function moneyLabel(minor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100)
}
