import { PublicEventsView } from '../../../../components/public/PublicEventsView'

/** `/p/[clubSlug]/events` — the public Events page P-06 (navigation spec REQ-N13; #263). Sessionless; data from the API. */
export default function PublicEventsRoute({ params }: { params?: { clubSlug?: string } }) {
  return <PublicEventsView clubSlug={params?.clubSlug ?? ''} />
}
