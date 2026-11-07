// Client pieces of the public club pages `/p/[clubSlug]` and `/p/[clubSlug]/sections/[sectionSlug]` (club spec UI
// table, DD-23; #29): the response shapes of `GET /api/club_core/public/…`, their queries and the load result, which
// tells a missing page (404 `public_page_not_found`) from a club that does not publish one (404
// `public_page_disabled`) and from a failed request. The provider blocks (#91): `groups` (`groups.publicCatalog`) and
// `schedule` (`activities.publicSchedule`: the groups' schedule on a section page, the upcoming events on the club page);
// `prices` (`payments.publicPrices`, #112: each public group's fees and sibling discount on a section page).
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type PublicLogo = { url: string | null; source: 'section' | 'club' | 'initial'; initial: string }

/** The club phone of the page footer; null while the club does not publish the `contact` block (E06-S07, #89). */
export type PublicClubContact = { phone: string } | null

/** A session or event as a guest sees it: a club-zone date and `HH:mm` times. */
export type PublicSession = {
  date: string
  startTime: string
  endTime: string
  place: string | null
  cancelled: boolean
}

export type PublicEvent = PublicSession & { name: string; type: string; section: { name: string; slug: string } }

export type PublicClubPage = {
  club: {
    name: string
    slug: string
    description: string | null
    logo: PublicLogo
    contact: PublicClubContact
  }
  sections: { name: string; slug: string; logo: PublicLogo; shortDescription: string | null }[]
  blocks: {
    schedule?: { events: PublicEvent[] }
    /** The number of public groups per public section slug (`groups.publicCatalog`, #89). */
    groups?: { counts: Record<string, number> }
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
  club: { name: string; slug: string; logo: PublicLogo; contact: PublicClubContact }
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

async function loadPublic<T>(url: string): Promise<PublicLoad<T>> {
  const call = await apiCall<T & { code?: string }>(url)
  if (call.ok && call.result) return { status: 'ok', page: call.result }
  if (call.status === 404)
    return call.result?.code === 'public_page_disabled' ? { status: 'disabled' } : { status: 'not_found' }
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
