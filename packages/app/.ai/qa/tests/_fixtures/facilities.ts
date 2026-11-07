// Facilities fixtures (#121, facilities spec phase 5 step 2): zone rules, the bulk booking availability, closures,
// rental rates and the opening hours of a place (`club_core_places.opening_hours`, DD-41).
import { expect, type APIRequestContext } from '@playwright/test'
import { scheduleFor, type ScheduleSetup } from './activities'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, mercato, type Club } from './club'
import { create, getOne, update } from './club-structure'

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

// --- Rentals (#122, facilities spec phase 5 step 3) ---

export type RentalItem = {
  id: string
  placeId: string
  renterType: string
  renterId: string | null
  renterDisplayName: string | null
  renterCategory: string
  contactName: string | null
  contactPhone: string | null
  requestedVia: string
  startsAt: string
  endsAt: string
  units: number
  amount: number
  chargeId: string | null
  status: string
  cancellationDeadline: string | null
  paymentDeadline: string | null
  regulationsAcceptedAt: string | null
  needsReschedule: boolean
  updatedAt: string
}

export type RentalConflict = { kind: string; id: string; start: string; end: string }

export type RentalCreated = CodedError & {
  id?: string
  status?: string
  amount?: number
  endsAt?: string
  cancellationDeadline?: string | null
  paymentDeadline?: string | null
  chargeId?: string | null
  conflicts?: RentalConflict[]
}

export type RentalQuote = CodedError & {
  endsAt?: string
  amount?: number | null
  appliedCategory?: string | null
  cancellationDeadline?: string
  paymentDeadline?: string
  issues?: Array<{ code: string; conflicts?: RentalConflict[] }>
}

export type RentalAction = CodedError & {
  ok?: boolean
  status?: string
  updatedAt?: string
  startsAt?: string
  endsAt?: string
  conflicts?: RentalConflict[]
}

export async function postRental(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<RentalCreated>(request, 'POST', '/api/facilities/rentals', token, { data })
}

export async function quoteRental(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<RentalQuote>(request, 'POST', '/api/facilities/rentals/quote', token, { data })
}

export async function listRentals(request: APIRequestContext, token: string, query = ''): Promise<RentalItem[]> {
  const result = await call<List<RentalItem>>(request, 'GET', `/api/facilities/rentals?pageSize=200${query}`, token)
  expect(result.status, `GET /api/facilities/rentals ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

export async function getRental(request: APIRequestContext, token: string, id: string): Promise<RentalItem> {
  const rental = (await listRentals(request, token)).find((item) => item.id === id)
  if (!rental) throw new Error(`[internal] rental ${id} not listed`)
  return rental
}

/** `POST /api/facilities/rentals/{id}/{action}` with the rental's current lock token. */
export async function rentalAction(
  request: APIRequestContext,
  token: string,
  id: string,
  action: 'confirm' | 'cancel' | 'move' | 'no-show',
  data: Record<string, unknown> = {},
) {
  const current = await getRental(request, token, id)
  return call<RentalAction>(request, 'POST', `/api/facilities/rentals/${id}/${action}`, token, {
    data,
    headers: { [OPTIMISTIC_LOCK_HEADER]: current.updatedAt },
  })
}

export async function postEntryBan(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string }>(request, 'POST', '/api/facilities/entry-bans', token, { data })
}

export type RentalSetup = ScheduleSetup & { neighbours: string; banned: string }

/**
 * A pitch ready for rentals (J-005): the Orlik opening hours; club training Mon–Fri 16:00–19:30 (priority 2); booking
 * availability Mon–Fri 08:00–16:00 and 19:30–22:00, Sat–Sun 09:00–20:30 from today; rates per 90 minutes —
 * municipal club 150 zł, external 250 zł and an all-year winter-lighting rate of 180 zł, so a municipal club is always
 * quoted the lighting rate; two renter institutions.
 */
export async function rentalPitch(request: APIRequestContext, club: Club): Promise<RentalSetup> {
  const admin = club.adminToken
  const setup = await scheduleFor(request, club)
  const today = calendarDate()
  await setOpeningHours(request, admin, setup.pitch, ORLIK_HOURS)
  const training = await postZoneRule(request, admin, {
    placeId: setup.pitch,
    weekdays: [1, 2, 3, 4, 5],
    timeFrom: '16:00',
    timeTo: '19:30',
    zone: 'club_training',
    priority: 2,
    validFrom: today,
  })
  expect(training.status, JSON.stringify(training.body)).toBe(201)
  const weekdays = [1, 2, 3, 4, 5].flatMap((weekday) => [
    { weekday, from: '08:00', to: '16:00' },
    { weekday, from: '19:30', to: '22:00' },
  ])
  const weekend = [6, 7].map((weekday) => ({ weekday, from: '09:00', to: '20:30' }))
  const bulk = await bulkAvailability(request, admin, {
    placeIds: [setup.pitch],
    mode: 'replace',
    validFrom: today,
    windows: [...weekdays, ...weekend],
  })
  expect(bulk.status, JSON.stringify(bulk.body)).toBe(200)
  for (const rate of [
    { renterCategory: 'municipal_club', pricePer90: 15_000 },
    { renterCategory: 'external_commercial', pricePer90: 25_000 },
    {
      renterCategory: 'municipal_club_winter_lighting',
      pricePer90: 18_000,
      seasonFrom: '01-01',
      seasonTo: '12-31',
      includesLighting: true,
    },
  ]) {
    const created = await postRate(request, admin, { placeId: setup.pitch, validFrom: today, ...rate })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
  }
  const neighbours = await create(request, admin, 'institutions', { name: 'KS Sąsiedzi', type: 'club' })
  const banned = await create(request, admin, 'institutions', { name: 'FC Zakazani', type: 'club' })
  return { ...setup, neighbours, banned }
}

/** The body of a staff rental by phone for an institution renter. */
export function phoneRental(placeId: string, renterId: string, startsAt: string, units = 1): Record<string, unknown> {
  return {
    placeId,
    renterType: 'institution',
    renterId,
    renterCategory: 'external_commercial',
    startsAt,
    units,
    contactName: 'Jan Kontakt',
    contactPhone: '600 000 001',
    requestedVia: 'phone',
    regulationsAccepted: true,
  }
}

export type LifecycleResult = { now: string; done: number; changedIds: string[] }

/** Runs `yarn mercato facilities rental-lifecycle` for the club as of `nowIso` (DD-46). */
export function runRentalLifecycle(club: Club, nowIso: string): LifecycleResult {
  const result = mercato([
    'facilities',
    'rental-lifecycle',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--now',
    nowIso,
  ]) as LifecycleResult | null
  if (!result) throw new Error('[internal] facilities rental-lifecycle printed no result')
  return result
}
