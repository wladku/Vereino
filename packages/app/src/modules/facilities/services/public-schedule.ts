// The public facility calendar (facilities spec P-03, P-04, the two `GET /api/facilities/public/…` rows, REQ-014,
// TEST-024; #124). The club and the place come from `club_core`'s public site — the one approved slug lookup
// (`clubCorePublicSite`, AGENTS.md exception D-024/D-026, DD-35) and the place's `is_public_schedule` (DD-29) — and
// every later read carries the tenant and organization that lookup found. The month is built from the entries on
// the place family — read with their kind and times only, never an encrypted column or a name (`publicEntries`) —
// and the place's zones and opening hours, then reduced to states: nothing a guest receives names a renter, a person,
// a group, an activity, a booking's purpose or a closure's reason, and no entry or place id leaves this file (the
// photo and regulations URLs carry the public file's id, as the section materials do). Each entry is converted to
// club-zone minutes once, so a busy month costs one pass. The responses are cached by shared caches for 60 s only and
// never on the server (DD-45).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { addDays, openingWindowsOn, zonedInstant, type CalendarDate, type OpeningHours } from '@vereino/core'
import type {
  ClubCorePublicSite,
  PublicClubFrame,
  PublicPlace,
  PublicSiteResult,
} from '../../club_core/services/public-site'
import type { PublicBlockProvider } from '../../club_core/services/public-blocks'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import { Closure, InternalBooking, MaintenanceTask, Rental, RentalRate, ZoneRule } from '../data/entities'
import { rentalRateShapeOf, zoneRuleShapeOf } from '../data/shapes'
import { OCCUPYING_BOOKING_STATUSES } from '../lib/internal-bookings'
import {
  datesBetween,
  entryState,
  daySpans,
  firstRequestMinute,
  localMoment,
  publicDaySlots,
  publicRates,
  scheduleMonth,
  type PublicRate,
  type PublicSlot,
  type PublicSlotState,
  type ScheduleEntryKind,
} from '../lib/public-schedule'
import { OCCUPYING_RENTAL_STATUSES } from '../lib/rentals'
import { dayZoneSegments } from '../lib/zones'
import { openingHours, plannedSessions, type FacilitiesScope } from './directory'
import { placeFamilyIds } from './occupancy'

const CLUB_CORE_PUBLIC_SITE = 'clubCorePublicSite'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'

/** The club as every public facilities page shows it (header and footer). */
export type PublicFacilitiesClub = PublicClubFrame['club']

/** A place card of P-03: no id. */
export type PublicPlaceCard = Omit<PublicPlace, 'id'>

export type PublicPlacesView = { club: PublicFacilitiesClub; places: PublicPlaceCard[] }

export type PublicScheduleDay = {
  date: string
  /** The opening windows of the day; null = no opening-hours limit, [] = closed all day. */
  opening: Array<{ from: string; to: string }> | null
  slots: PublicSlot[]
}

export type PublicScheduleView = {
  club: PublicFacilitiesClub
  place: PublicPlaceCard & { photoUrls: string[]; regulationsText: string | null; regulationsUrl: string | null }
  month: string
  previousMonth: string | null
  nextMonth: string | null
  timeZone: string
  currency: string
  /** The place's effective opening hours (its own or its nearest ancestor's, DD-41); null = no limit. */
  openingHours: OpeningHours | null
  rates: PublicRate[]
  /** The phone the page shows: the club's, published with its `contact` block. */
  phone: string | null
  days: PublicScheduleDay[]
}

/** Why a public read has nothing to show: unknown or non-public (404), no places calendar (404), a bad month (400). */
export type PublicFacilitiesResult<T> =
  { status: 'ok'; value: T } | { status: 'not_found' } | { status: 'disabled' } | { status: 'month_invalid' }

function site(container: AwilixContainer): ClubCorePublicSite | null {
  return container.hasRegistration(CLUB_CORE_PUBLIC_SITE)
    ? container.resolve<ClubCorePublicSite>(CLUB_CORE_PUBLIC_SITE)
    : null
}

function card(place: PublicPlace): PublicPlaceCard {
  return {
    slug: place.slug,
    name: place.name,
    kind: place.kind,
    surface: place.surface,
    address: place.address,
    photoUrl: place.photoUrl,
    acceptsOnlineRequests: place.acceptsOnlineRequests,
  }
}

function notOk<T>(result: Exclude<PublicSiteResult<unknown>, { status: 'ok' }>): PublicFacilitiesResult<T> {
  return { status: result.status }
}

/** `GET /api/facilities/public/{clubSlug}/places` (P-03): the club's places with a public calendar, by name. */
export async function publicPlacesView(
  container: AwilixContainer,
  clubSlug: string,
): Promise<PublicFacilitiesResult<PublicPlacesView>> {
  const publicSite = site(container)
  if (!publicSite) return { status: 'not_found' }
  const result = await publicSite.publicPlaces(clubSlug)
  if (result.status !== 'ok') return notOk(result)
  return { status: 'ok', value: { club: result.value.frame.club, places: result.value.places.map(card) } }
}

/**
 * `GET /api/facilities/public/{clubSlug}/places/{placeSlug}/schedule?month=` (P-04): the place's month as states, with
 * its opening hours, rates, rules and the club phone.
 */
export async function publicScheduleView(
  container: AwilixContainer,
  clubSlug: string,
  placeSlug: string,
  month: string | undefined,
  now: Date,
): Promise<PublicFacilitiesResult<PublicScheduleView>> {
  const publicSite = site(container)
  if (!publicSite) return { status: 'not_found' }
  const found = await publicSite.publicPlace(clubSlug, placeSlug)
  if (found.status !== 'ok') return notOk(found)
  const { frame, place } = found.value
  const scope = { tenantId: frame.tenantId, organizationId: frame.organizationId }
  const settings = await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope)
  const timeZone = settings.values.timezone
  const range = scheduleMonth(month, localMoment(now, timeZone).date)
  if (!range) return { status: 'month_invalid' }
  const em = container.resolve<EntityManager>('em').fork()
  const window = {
    start: zonedInstant(range.first, '00:00', timeZone),
    end: zonedInstant(addDays(range.last, 1), '00:00', timeZone),
  }
  const familyIds = await placeFamilyIds(container, scope, place.id, em)
  const entries = await publicEntries(container, em, scope, familyIds, window, now)
  const byDate = new Map<CalendarDate, Array<{ from: number; to: number; state: PublicSlotState }>>()
  for (const entry of entries) {
    for (const [date, span] of daySpans(entry, timeZone)) {
      byDate.set(date, [...(byDate.get(date) ?? []), { ...span, state: entryState(entry.kind) }])
    }
  }
  const nowLocal = localMoment(now, timeZone)
  const hours = (await openingHours(container, scope, [place.id], em)).get(place.id) ?? null
  const rules = (await em.find(ZoneRule, { ...scope, deletedAt: null, placeId: place.id })).map(zoneRuleShapeOf)
  const rates = (await em.find(RentalRate, { ...scope, deletedAt: null, placeId: place.id })).map(rentalRateShapeOf)
  const days = datesBetween(range.first, range.last).map((date) => {
    const opening = openingWindowsOn(hours, date)?.map((w) => ({ from: w.from, to: w.to })) ?? null
    return {
      date,
      opening,
      slots: publicDaySlots({
        zones: dayZoneSegments(rules, date),
        opening,
        entries: byDate.get(date) ?? [],
        requestsEnabled: place.acceptsOnlineRequests,
        notBefore: firstRequestMinute(date, nowLocal),
      }),
    }
  })
  return {
    status: 'ok',
    value: {
      club: frame.club,
      place: {
        ...card(place),
        photoUrls: place.photoUrls,
        regulationsText: place.regulationsText,
        regulationsUrl: place.regulationsUrl,
      },
      month: range.month,
      previousMonth: range.previous,
      nextMonth: range.next,
      timeZone,
      currency: settings.values.currency,
      openingHours: hours,
      rates: publicRates(rates, place.id, range.first, range.last),
      phone: frame.club.contact?.phone ?? null,
      days,
    },
  }
}

/**
 * The entries on `placeIds` overlapping the window, as a kind and times only: planned sessions, confirmed internal
 * bookings, occupying rentals, external requests whose hold is valid at `now`, closures. The same entries as the staff
 * calendar (`services/calendar.ts`), without decrypting a renter's name or resolving a booker's.
 */
async function publicEntries(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
  now: Date,
): Promise<Array<{ kind: ScheduleEntryKind; start: Date; end: Date }>> {
  const where = {
    ...scope,
    deletedAt: null,
    placeId: { $in: [...placeIds] },
    startsAt: { $lt: window.end },
    endsAt: { $gt: window.start },
  }
  const times = ['id', 'startsAt', 'endsAt'] as const
  const sessions = await plannedSessions(container, scope, placeIds, window, em)
  const rentals = await em.find(
    Rental,
    {
      ...where,
      $or: [
        { status: { $in: [...OCCUPYING_RENTAL_STATUSES] } },
        { status: 'pending_approval', holdExpiresAt: { $gt: now } },
      ],
    },
    { fields: [...times, 'status'] },
  )
  const bookings = await em.find(
    InternalBooking,
    { ...where, status: { $in: [...OCCUPYING_BOOKING_STATUSES] } },
    { fields: [...times] },
  )
  const closures = await em.find(Closure, where, { fields: [...times] })
  const works = await em.find(MaintenanceTask, { ...where, status: 'planned' }, { fields: [...times] })
  return [
    ...sessions.map((row) => ({ kind: 'session' as const, start: row.startAt, end: row.endAt })),
    ...rentals.map((row) => ({
      kind: row.status === 'pending_approval' ? ('request' as const) : ('rental' as const),
      start: row.startsAt,
      end: row.endsAt,
    })),
    ...bookings.map((row) => ({ kind: 'booking' as const, start: row.startsAt, end: row.endsAt })),
    ...closures.map((row) => ({ kind: 'closure' as const, start: row.startsAt, end: row.endsAt })),
    ...works.map((row) => ({ kind: 'maintenance' as const, start: row.startsAt as Date, end: row.endsAt as Date })),
  ]
}

/** The place an online request names (P-04, #125): its trusted scope, id and name, and whether it takes requests. */
export type RequestPlace = {
  scope: FacilitiesScope
  placeId: string
  placeName: string
  /** The place's switch AND the club's `online_requests` block. */
  acceptsOnlineRequests: boolean
}

/**
 * The one slug lookup of `POST …/places/{placeSlug}/requests` (DD-35, through `clubCorePublicSite`): the club and the
 * public place, or why there is none. Every later read and write of the request uses the scope found here.
 */
export async function requestPlace(
  container: AwilixContainer,
  clubSlug: string,
  placeSlug: string,
): Promise<PublicFacilitiesResult<RequestPlace>> {
  const publicSite = site(container)
  if (!publicSite) return { status: 'not_found' }
  const found = await publicSite.publicPlace(clubSlug, placeSlug)
  if (found.status !== 'ok') return notOk(found)
  const { frame, place } = found.value
  return {
    status: 'ok',
    value: {
      scope: { tenantId: frame.tenantId, organizationId: frame.organizationId },
      placeId: place.id,
      placeName: place.name,
      acceptsOnlineRequests: place.acceptsOnlineRequests,
    },
  }
}

/** The public path of P-03. */
export const publicPlacesPath = (clubSlug: string): string => `/p/${encodeURIComponent(clubSlug)}/places`

/**
 * The `facilities.publicPlaces` block of the club page (club spec DD-28; P-01 → P-03): the number of places with a
 * public calendar and the link to their list, while the club publishes its `places_calendar` block; none without a
 * public place.
 */
export function createPublicPlacesBlock(container: AwilixContainer): PublicBlockProvider {
  return {
    block: 'places_calendar',
    key: 'places',
    async clubBlock(ctx) {
      const result = await publicPlacesView(container, ctx.clubSlug)
      if (result.status !== 'ok' || result.value.places.length === 0) return null
      return { count: result.value.places.length, path: publicPlacesPath(ctx.clubSlug) }
    },
  }
}
