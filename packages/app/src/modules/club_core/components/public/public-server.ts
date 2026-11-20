// The server side of the public club pages P-01, P-02, P-06 and P-T1 (#487): each page reads its state through its own
// public API handler (`loadPublicRoute`, the single data source, same rate limit), so the HTML a guest, a link preview
// or a search engine gets already holds the club's name, sections and events without JavaScript; and the document
// title "{club} — {page}" with an Open Graph title and description made only of what the page publishes (S9.4: no
// personal data). One read per request: `cache` shares it between the metadata and the page. A read the server could
// not make leaves the page to the browser fetch it always had; a page that is not `ok` keeps the route's own title.
import { cache } from 'react'
import type { Metadata } from 'next'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { loadPublicRoute } from '@/modules/foundation'
import { previewText, publicLoadOf, type PublicLoad } from '../../lib/public-load'
import * as clubRoute from '../../api/public/[clubSlug]/route'
import * as sectionRoute from '../../api/public/[clubSlug]/sections/[sectionSlug]/route'
import * as eventsRoute from '../../api/public/[clubSlug]/events/route'
import * as clubEventRoute from '../../api/public/[clubSlug]/events/[eventSlug]/route'
import type { PublicClubEventPage, PublicClubPage, PublicEventsPage, PublicSectionPage } from './public-client'

const segment = encodeURIComponent

export const loadPublicClub = cache(async (clubSlug: string): Promise<PublicLoad<PublicClubPage> | undefined> => {
  const answer = await loadPublicRoute({
    handler: clubRoute.GET,
    path: `/api/club_core/public/${segment(clubSlug)}`,
    params: { clubSlug },
    rateLimit: clubRoute.metadata.GET.rateLimit,
  })
  return (answer && publicLoadOf<PublicClubPage>(answer)) ?? undefined
})

export const loadPublicSection = cache(
  async (clubSlug: string, sectionSlug: string): Promise<PublicLoad<PublicSectionPage> | undefined> => {
    const answer = await loadPublicRoute({
      handler: sectionRoute.GET,
      path: `/api/club_core/public/${segment(clubSlug)}/sections/${segment(sectionSlug)}`,
      params: { clubSlug, sectionSlug },
      rateLimit: sectionRoute.metadata.GET.rateLimit,
    })
    return (answer && publicLoadOf<PublicSectionPage>(answer)) ?? undefined
  },
)

export const loadPublicEvents = cache(
  async (clubSlug: string, sectionSlug: string | null): Promise<PublicLoad<PublicEventsPage> | undefined> => {
    const answer = await loadPublicRoute({
      handler: eventsRoute.GET,
      path: `/api/club_core/public/${segment(clubSlug)}/events${sectionSlug ? `?section=${segment(sectionSlug)}` : ''}`,
      params: { clubSlug },
      rateLimit: eventsRoute.metadata.GET.rateLimit,
    })
    return (answer && publicLoadOf<PublicEventsPage>(answer)) ?? undefined
  },
)

export const loadPublicClubEvent = cache(
  async (clubSlug: string, eventSlug: string): Promise<PublicLoad<PublicClubEventPage> | undefined> => {
    const answer = await loadPublicRoute({
      handler: clubEventRoute.GET,
      path: `/api/club_core/public/${segment(clubSlug)}/events/${segment(eventSlug)}`,
      params: { clubSlug, eventSlug },
      rateLimit: clubEventRoute.metadata.GET.rateLimit,
    })
    return (answer && publicLoadOf<PublicClubEventPage>(answer)) ?? undefined
  },
)

/** The section filter of P-06 from the page's query (`?section=`); null for none or a repeated one. */
export function sectionFilterOf(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string | null {
  const value = searchParams?.section
  return typeof value === 'string' && value ? value : null
}

/** The document title "{club} — {page}" and its Open Graph twin; the description is public page text only. */
export async function publicPageMetadata(input: {
  club: string
  page: string
  description: string | null
}): Promise<Metadata> {
  const { t } = await resolveTranslations()
  const title = t('club_core.public.documentTitle', '{club} — {page}', { club: input.club, page: input.page })
  const description = previewText(input.description) ?? undefined
  return {
    title,
    description,
    openGraph: { title, description, siteName: input.club, type: 'website' },
  }
}

export async function publicClubMetadata(clubSlug: string): Promise<Metadata | null> {
  const load = await loadPublicClub(clubSlug)
  if (load?.status !== 'ok') return null
  const { t } = await resolveTranslations()
  const club = load.page.club
  return publicPageMetadata({
    club: club.name,
    page: t('club_core.public.pageTitle', 'Club page'),
    description:
      club.description ?? t('club_core.public.meta.club', 'Sections and classes of {club}.', { club: club.name }),
  })
}

export async function publicSectionMetadata(clubSlug: string, sectionSlug: string): Promise<Metadata | null> {
  const load = await loadPublicSection(clubSlug, sectionSlug)
  if (load?.status !== 'ok') return null
  const { t } = await resolveTranslations()
  const { club, section, blocks } = load.page
  return publicPageMetadata({
    club: club.name,
    page: section.name,
    description:
      blocks.description?.text ??
      t('club_core.public.meta.section', '{section} — a section of {club}.', {
        section: section.name,
        club: club.name,
      }),
  })
}

export async function publicEventsMetadata(clubSlug: string, sectionSlug: string | null): Promise<Metadata | null> {
  const load = await loadPublicEvents(clubSlug, sectionSlug)
  if (load?.status !== 'ok') return null
  const { t } = await resolveTranslations()
  const club = load.page.club
  return publicPageMetadata({
    club: club.name,
    page: t('club_core.public.events.pageTitle', 'Events'),
    description: t('club_core.public.meta.events', 'Upcoming events of {club}.', { club: club.name }),
  })
}

export async function publicClubEventMetadata(clubSlug: string, eventSlug: string): Promise<Metadata | null> {
  const load = await loadPublicClubEvent(clubSlug, eventSlug)
  if (load?.status !== 'ok') return null
  const { t } = await resolveTranslations()
  const { club, event } = load.page
  return publicPageMetadata({
    club: club.name,
    page: event.name,
    description:
      event.description ??
      t('club_core.public.meta.clubEvent', '{event} — an event of {club}.', { event: event.name, club: club.name }),
  })
}
