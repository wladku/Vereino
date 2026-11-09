import { PublicPlacesView } from '../../../../components/public/PublicPlacesView'

/** `/p/[clubSlug]/places` — the club's facilities for a guest (facilities spec P-03, REQ-014; #124). */
export default function PublicPlacesRoute({ params }: { params?: { clubSlug?: string } }) {
  return <PublicPlacesView clubSlug={params?.clubSlug ?? ''} />
}
