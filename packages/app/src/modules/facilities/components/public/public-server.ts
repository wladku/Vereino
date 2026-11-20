// The server side of the public facilities page P-03 (#487): the page reads its state through its own public API
// handler (`loadPublicRoute`, the single data source, same rate limit), so the HTML a guest, a link preview or a search
// engine gets already holds the club's places without JavaScript; and the document title "{club} — Facilities" with
// an Open Graph title and description made only of public text (S9.4). One read per request: `cache` shares it
// between the metadata and the page. A read the server could not make leaves the page to the browser fetch.
import { cache } from 'react'
import type { Metadata } from 'next'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { loadPublicRoute } from '@/modules/foundation'
import { publicFacilitiesLoadOf } from '../../lib/public-load'
import * as placesRoute from '../../api/public/[clubSlug]/places/route'
import type { PublicClub, PublicFacilitiesLoad, PublicPlacesView } from './public-client'

export const loadPublicPlaces = cache(
  async (clubSlug: string): Promise<PublicFacilitiesLoad<PublicPlacesView> | undefined> => {
    const answer = await loadPublicRoute({
      handler: placesRoute.GET,
      path: `/api/facilities/public/${encodeURIComponent(clubSlug)}/places`,
      params: { clubSlug },
      rateLimit: placesRoute.metadata.GET.rateLimit,
    })
    return (answer && publicFacilitiesLoadOf<PublicPlacesView, PublicClub>(answer)) ?? undefined
  },
)

/** "{club} — Facilities" while the API sends the club's header (the club publishes its page); else the route title. */
export async function publicPlacesMetadata(clubSlug: string): Promise<Metadata | null> {
  const load = await loadPublicPlaces(clubSlug)
  const club = load ? (load.status === 'ok' ? load.page.club : load.club) : null
  if (!club) return null
  const { t } = await resolveTranslations()
  const title = t('facilities.public.documentTitle', '{club} — {page}', {
    club: club.name,
    page: t('facilities.public.places.pageTitle', 'Facilities'),
  })
  const description = t('facilities.public.places.metaDescription', 'Facilities of {club} and their calendars.', {
    club: club.name,
  })
  return { title, description, openGraph: { title, description, siteName: club.name, type: 'website' } }
}
