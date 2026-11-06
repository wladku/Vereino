// Facilities fixtures (#121, facilities spec phase 5 step 2): zone rules, the bulk booking availability, closures,
// rental rates and the opening hours of a place (`club_core_places.opening_hours`, DD-41).
import { expect, type APIRequestContext } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, call } from './club'
import { getOne, update } from './club-structure'

type List<T> = { items?: T[]; total?: number }

export type CodedError = {
  error?: string
  code?: string
  dayErrors?: Array<{ placeId: string; weekday: number; code: string }>
  fieldErrors?: Record<string, string>
}

export type ZoneRuleItem = {
  id: string
  placeId: string
  weekdays: number[]
  timeFrom: string
  timeTo: string
  zone: string
  priority: number
  source: string
  validFrom: string
  validTo: string | null
  updatedAt: string
}

export type ClosureItem = {
  id: string
  placeId: string
  startsAt: string
  endsAt: string
  reason: string
  note: string | null
  updatedAt: string
}

export type RentalRateItem = {
  id: string
  placeId: string
  renterCategory: string
  pricePer90: number
  seasonFrom: string | null
  seasonTo: string | null
  includesLighting: boolean
  validFrom: string
  validTo: string | null
  updatedAt: string
}

export type BulkResult = CodedError & {
  created?: number
  removed?: number
  warnings?: { clubOccurrencesInWindows: number; pendingRequestsOutside: number }
}

/** The Orlik 2024 rules (§2): Mon–Fri 8:00–22:00, Sat–Sun 9:00–20:30, all year. */
export const ORLIK_HOURS = {
  seasons: [
    {
      from: '01-01',
      to: '12-31',
      windows: [
        ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, from: '08:00', to: '22:00' })),
        ...[6, 7].map((weekday) => ({ weekday, from: '09:00', to: '20:30' })),
      ],
    },
  ],
}

/** Sets a place's own opening hours through the place form's API (200 expected). */
export async function setOpeningHours(
  request: APIRequestContext,
  token: string,
  placeId: string,
  hours: unknown,
): Promise<void> {
  const place = await getOne(request, token, 'places', placeId)
  const result = await update(request, token, 'places', { id: placeId, openingHours: hours }, place?.updatedAt)
  expect(result.status, `PUT /api/club_core/places ${JSON.stringify(result.body)}`).toBe(200)
}

export async function postZoneRule(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string }>(request, 'POST', '/api/facilities/zone-rules', token, { data })
}

export async function listZoneRules(request: APIRequestContext, token: string, query = ''): Promise<ZoneRuleItem[]> {
  const result = await call<List<ZoneRuleItem>>(
    request,
    'GET',
    `/api/facilities/zone-rules?pageSize=200${query}`,
    token,
  )
  expect(result.status, `GET /api/facilities/zone-rules ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

export async function bulkAvailability(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<BulkResult>(request, 'POST', '/api/facilities/zone-rules/bulk', token, { data })
}

export async function postClosure(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string; flagged?: { sessions: number; rentals: number } }>(
    request,
    'POST',
    '/api/facilities/closures',
    token,
    { data },
  )
}

export async function putClosure(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown> & { id: string },
  lockToken: string | null | undefined,
) {
  return call<CodedError & { updatedAt?: string; flagged?: { sessions: number; rentals: number } }>(
    request,
    'PUT',
    '/api/facilities/closures',
    token,
    { data, headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {} },
  )
}

export async function listClosures(request: APIRequestContext, token: string, query = ''): Promise<ClosureItem[]> {
  const result = await call<List<ClosureItem>>(request, 'GET', `/api/facilities/closures?pageSize=200${query}`, token)
  expect(result.status, `GET /api/facilities/closures ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

export async function postRate(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string }>(request, 'POST', '/api/facilities/rental-rates', token, { data })
}

export async function listRates(request: APIRequestContext, token: string, query = ''): Promise<RentalRateItem[]> {
  const result = await call<List<RentalRateItem>>(
    request,
    'GET',
    `/api/facilities/rental-rates?pageSize=200${query}`,
    token,
  )
  expect(result.status, `GET /api/facilities/rental-rates ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}
