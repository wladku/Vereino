import { PublicEventsView } from '../../../../components/public/PublicEventsView'
import { loadPublicEvents, publicEventsMetadata, sectionFilterOf } from '../../../../components/public/public-server'

type Props = {
  params?: { clubSlug?: string }
  searchParams?: Record<string, string | string[] | undefined>
}

/**
 * `/p/[clubSlug]/events` — the club's Events page P-06 (#263). Sessionless; the server reads it (with its `?section=`
 * filter) through the public API, so its HTML holds the events without JavaScript, titled "{club} — Events" (#487).
 */
export default async function PublicEventsRoute({ params, searchParams }: Props) {
  const clubSlug = params?.clubSlug ?? ''
  const section = sectionFilterOf(searchParams)
  return (
    <PublicEventsView
      clubSlug={clubSlug}
      initial={await loadPublicEvents(clubSlug, section)}
      initialSection={section}
    />
  )
}

PublicEventsRoute.generateMetadata = ({ params, searchParams }: Props) =>
  publicEventsMetadata(params?.clubSlug ?? '', sectionFilterOf(searchParams))
