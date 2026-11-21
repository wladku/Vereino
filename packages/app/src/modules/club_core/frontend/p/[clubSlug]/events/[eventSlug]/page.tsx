import { PublicClubEventView } from '../../../../../components/public/PublicClubEventView'
import { loadPublicClubEvent, publicClubEventMetadata } from '../../../../../components/public/public-server'

type Props = { params?: { clubSlug?: string; eventSlug?: string } }

/**
 * `/p/[clubSlug]/events/[eventSlug]` — the tournament page P-T1 of a published club event (club events spec REQ-T09,
 * DD-T11; #381). Sessionless; the server reads it through the public API, so its HTML holds the event without
 * JavaScript, titled "{club} — {event}" (#487).
 */
export default async function PublicClubEventRoute({ params }: Props) {
  const clubSlug = params?.clubSlug ?? ''
  const eventSlug = params?.eventSlug ?? ''
  return (
    <PublicClubEventView
      clubSlug={clubSlug}
      eventSlug={eventSlug}
      initial={await loadPublicClubEvent(clubSlug, eventSlug)}
    />
  )
}

PublicClubEventRoute.generateMetadata = ({ params }: Props) =>
  publicClubEventMetadata(params?.clubSlug ?? '', params?.eventSlug ?? '')
