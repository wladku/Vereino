import { PublicClubEventView } from '../../../../../components/public/PublicClubEventView'

/**
 * `/p/[clubSlug]/events/[eventSlug]` — the tournament page P-T1 of a published club event (club events spec REQ-T09,
 * DD-T11; #381). Sessionless; data from the API.
 */
export default function PublicClubEventRoute({ params }: { params?: { clubSlug?: string; eventSlug?: string } }) {
  return <PublicClubEventView clubSlug={params?.clubSlug ?? ''} eventSlug={params?.eventSlug ?? ''} />
}
