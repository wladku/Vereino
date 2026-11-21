import { PublicPlacesView } from '../../../../components/public/PublicPlacesView'
import { loadPublicPlaces, publicPlacesMetadata } from '../../../../components/public/public-server'

type Props = { params?: { clubSlug?: string } }

/**
 * `/p/[clubSlug]/places` — the club's facilities for a guest (facilities spec P-03, REQ-014; #124). Sessionless; the
 * server reads it through the public API, so its HTML holds the places without JavaScript, titled "{club} — Facilities"
 * (#487).
 */
export default async function PublicPlacesRoute({ params }: Props) {
  const clubSlug = params?.clubSlug ?? ''
  return <PublicPlacesView clubSlug={clubSlug} initial={await loadPublicPlaces(clubSlug)} />
}

PublicPlacesRoute.generateMetadata = ({ params }: Props) => publicPlacesMetadata(params?.clubSlug ?? '')
