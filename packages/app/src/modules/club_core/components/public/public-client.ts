// Client pieces of the public club pages `/p/[clubSlug]` and `/p/[clubSlug]/sections/[sectionSlug]` (club spec UI
// table, DD-23; #29): the response shapes of `GET /api/club_core/public/…`, their queries and the load result, which
// tells a missing page (404 `public_page_not_found`) from a club that does not publish one (404
// `public_page_disabled`) and from a failed request. The provider blocks (#91): `groups` (`groups.publicCatalog`) and
// `schedule` (`activities.publicSchedule`: the groups' schedule on a section page); the Events page P-06 (#263);
// `prices` (`payments.publicPrices`, #112: each public group's fees and sibling discount on a section page); the
// tournament page P-T1 of a published club event (club events spec REQ-T09, #381).
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type PublicLogo = { url: string | null; source: 'section' | 'club' | 'initial'; initial: string }

/** The club phone of the page footer; null while the club does not publish the `contact` block (E06-S07, #89). */
export type PublicClubContact = { phone: string } | null

/** The club's rules and privacy policy in the page footer; each null while the club has not set it (#195). */
export type PublicClubLinks = { rules: string | null; privacyPolicy: string | null }

/** The club's colour and the text colour on it (#486); null uses the default, `--primary`. */
export type PublicClubAccent = { color: string; foreground: '#000000' | '#ffffff' } | null

/** Which optional links the public header shows: Facilities and Events, each while the club publishes it (#261). */
export type PublicClubNav = { facilities: boolean; events: boolean }

/** A session or event as a guest sees it: a club-zone date and `HH:mm` times. */
export type PublicSession = {
  date: string
  startTime: string
  endTime: string
  place: string | null
  cancelled: boolean
}

/** An entry of the public Events page P-06 (#263): a one-off event, or a club event with its own page (#381). */
export type PublicEvent = {
  kind: 'event' | 'club_event'
  name: string
  type: string
  date: string
  endDate: string
  startTime: string
  endTime: string
  place: string | null
  mapUrl: string | null
  cancelled: boolean
  past: boolean
  /** Null for a club event of the whole club (its logo is the club's). */
  section: { name: string; slug: string } | null
  sectionLogo: PublicLogo
  clubEventSlug: string | null
  partsCount: number | null
  posterUrl: string | null
}

/** Our team of a part on P-T1: a public group with its section, the club's name, or none (an open part). */
export type PublicClubEventOurTeam =
  { groupName: string; section: { name: string; slug: string } } | { clubName: string } | null

export type PublicClubEventPart = {
  title: string
  category: string | null
  type: string
  date: string
  startTime: string
  endTime: string
  cancelled: boolean
  ourTeam: PublicClubEventOurTeam
  visitingTeams: { name: string; clubName: string | null }[]
}

/** The tournament page P-T1 (#381). */
export type PublicClubEventPage = {
  club: {
    name: string
    slug: string
    logo: PublicLogo
    contact: PublicClubContact
    links: PublicClubLinks
    accent: PublicClubAccent
    nav: PublicClubNav
  }
  event: {
    name: string
    slug: string
    status: 'planned' | 'cancelled'
    dateFrom: string
    dateTo: string
    description: string | null
    place: { name: string; address: string | null; mapUrl: string | null } | null
    poster: { url: string } | null
    funders: { name: string; logoUrl: string }[]
    days: { date: string; parts: PublicClubEventPart[] }[]
  }
}

export type PublicEventsPage = {
  club: {
    name: string
    slug: string
    logo: PublicLogo
    contact: PublicClubContact
    links: PublicClubLinks
    accent: PublicClubAccent
    nav: PublicClubNav
  }
  sections: { name: string; slug: string }[]
  section: string | null
  upcoming: PublicEvent[]
  past: PublicEvent[]
}

export type PublicClubPage = {
  club: {
    name: string
    slug: string
    description: string | null
    logo: PublicLogo
    contact: PublicClubContact
    links: PublicClubLinks
    accent: PublicClubAccent
    nav: PublicClubNav
  }
  sections: { name: string; slug: string; logo: PublicLogo; shortDescription: string | null }[]
  blocks: {
    /** The number of public groups per public section slug (`groups.publicCatalog`, #89). */
    groups?: { counts: Record<string, number> }
    /** The club's places with a public calendar and their list (`facilities.publicPlaces`, #124; P-01 → P-03). */
    places?: { count: number; path: string }
    [key: string]: unknown
  }
}

/** A public group card (`groups.publicCatalog`); `conditions` and `instructors` only with their blocks. */
export type PublicGroupCard = {
  id: string
  name: string
  kind: string
  description: string | null
  ageFrom: number | null
  ageTo: number | null
  level: string | null
  /** A team's age category ("category U-11", #263); null otherwise. */
  ageCategory: string | null
  conditions?: string | null
  /** A null name: the instructor did not consent (the card says "Section coach"). */
  instructors?: { name: string | null }[]
}

/** A public group's schedule (`activities.publicSchedule`). */
export type PublicGroupSchedule = {
  groupId: string
  series: { weekdays: string[]; startTime: string; endTime: string; place: string | null }[]
  upcoming: PublicSession[]
}

/** A public group's fees (`payments.publicPrices`, #112): grosz, the period and the sibling discount in percent. */
export type PublicGroupPrices = {
  groupId: string
  fees: {
    amount: number
    currency: string
    period: 'monthly' | 'one_off' | 'per_occurrence'
    siblingDiscountPercent: number | null
  }[]
}

export type PublicMaterial = {
  id: string
  title: string
  fileName: string
  mimeType: string
  fileSize: number
  url: string
}

export type PublicSectionPage = {
  club: {
    name: string
    slug: string
    logo: PublicLogo
    contact: PublicClubContact
    links: PublicClubLinks
    accent: PublicClubAccent
    nav: PublicClubNav
  }
  section: { name: string; slug: string; logo: PublicLogo }
  blocks: {
    description?: { text: string }
    conditions?: { text: string }
    materials?: { items: PublicMaterial[] }
    contact?: { name: string | null; email: string | null; phone: string | null }
    groups?: { items: PublicGroupCard[] }
    schedule?: { groups: PublicGroupSchedule[] }
    prices?: { groups: PublicGroupPrices[] }
    [key: string]: unknown
  }
}

export type PublicLoad<T> = { status: 'ok'; page: T } | { status: 'not_found' } | { status: 'disabled' }

export const clubHref = (clubSlug: string): string => `/p/${encodeURIComponent(clubSlug)}`

export const sectionHref = (clubSlug: string, sectionSlug: string): string =>
  `${clubHref(clubSlug)}/sections/${encodeURIComponent(sectionSlug)}`

/** The tournament page P-T1 of a club event (#381). */
export const clubEventHref = (clubSlug: string, eventSlug: string): string =>
  `${clubHref(clubSlug)}/events/${encodeURIComponent(eventSlug)}`

/** P-06, optionally filtered to one section (`?section=`, #263). */
export const eventsHref = (clubSlug: string, sectionSlug?: string | null): string =>
  `${clubHref(clubSlug)}/events${sectionSlug ? `?section=${encodeURIComponent(sectionSlug)}` : ''}`

async function loadPublic<T>(url: string): Promise<PublicLoad<T>> {
  const call = await apiCall<T & { code?: string }>(url)
  if (call.ok && call.result) return { status: 'ok', page: call.result }
  if (call.status === 404)
    return call.result?.code === 'public_page_disabled' || call.result?.code === 'public_events_disabled'
      ? { status: 'disabled' }
      : { status: 'not_found' }
  throw new Error(`[internal] public page request failed with ${String(call.status)}`)
}

export function usePublicClub(clubSlug: string) {
  return useQuery({
    queryKey: ['club_core-public-club', clubSlug],
    queryFn: () => loadPublic<PublicClubPage>(`/api/club_core/public/${encodeURIComponent(clubSlug)}`),
    retry: false,
  })
}

export function usePublicSection(clubSlug: string, sectionSlug: string) {
  return useQuery({
    queryKey: ['club_core-public-section', clubSlug, sectionSlug],
    queryFn: () =>
      loadPublic<PublicSectionPage>(
        `/api/club_core/public/${encodeURIComponent(clubSlug)}/sections/${encodeURIComponent(sectionSlug)}`,
      ),
    retry: false,
  })
}

/** P-06 (#263): `disabled` while the club does not publish its page or its events. */
export function usePublicEvents(clubSlug: string, sectionSlug: string | null) {
  return useQuery({
    queryKey: ['club_core-public-events', clubSlug, sectionSlug],
    queryFn: () =>
      loadPublic<PublicEventsPage>(
        `/api/club_core/public/${encodeURIComponent(clubSlug)}/events${sectionSlug ? `?section=${encodeURIComponent(sectionSlug)}` : ''}`,
      ),
    retry: false,
  })
}

/**
 * P-T1 (#381): `disabled` while the club does not publish its page or its events, `not_found` for an unknown club,
 * an unknown event or one that is not published.
 */
export function usePublicClubEvent(clubSlug: string, eventSlug: string) {
  return useQuery({
    queryKey: ['club_core-public-club-event', clubSlug, eventSlug],
    queryFn: () =>
      loadPublic<PublicClubEventPage>(
        `/api/club_core/public/${encodeURIComponent(clubSlug)}/events/${encodeURIComponent(eventSlug)}`,
      ),
    retry: false,
  })
}

/** A file size in the reader's locale (kB below 1 MB, else MB). */
export function formatFileSize(bytes: number, locale: string): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return bytes < 1024 * 1024
    ? `${format.format(Math.max(1, Math.round(bytes / 1024)))} kB`
    : `${format.format(bytes / (1024 * 1024))} MB`
}

/** An amount in minor units in the reader's locale, without the grosz when it is whole (`12000` → "120 zł"). */
export function formatPublicAmount(minor: number, currency: string, locale: string): string {
  const whole = minor % 100 === 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(minor / 100)
}

/** The short format label of a material (PDF, PNG, JPG, WEBP). */
export function formatLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'image/jpeg') return 'JPG'
  return mimeType.replace(/^image\//, '').toUpperCase()
}

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** The reader's short name of an RFC 5545 weekday (`TU` → "Tue" / "wt."); the code itself when unknown. */
export function weekdayLabel(code: string, locale: string): string {
  const index = WEEKDAY_CODES.indexOf(code)
  if (index < 0) return code
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, 1 + index)),
  )
}

/** A club-zone calendar date (`YYYY-MM-DD`) with its weekday, in the reader's locale. */
export function formatPublicDate(date: string, locale: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    parsed,
  )
}

/** A club-zone calendar date as a day heading (`2026-11-21` → "Saturday, 21 November"), in the reader's locale. */
export function formatPublicDay(date: string, locale: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    parsed,
  )
}
