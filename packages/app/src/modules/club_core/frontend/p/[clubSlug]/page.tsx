import { PublicClubView } from '../../../components/public/PublicClubView'

/** `/p/[clubSlug]` — the public club page (club spec DD-23, REQ-025; #29). Sessionless; the data comes from the API. */
export default function PublicClubRoute({ params }: { params?: { clubSlug?: string } }) {
  return <PublicClubView clubSlug={params?.clubSlug ?? ''} />
}
