import { PublicClubView } from '../../../components/public/PublicClubView'
import { loadPublicClub, publicClubMetadata } from '../../../components/public/public-server'

type Props = { params?: { clubSlug?: string } }

/**
 * `/p/[clubSlug]` — the public club page P-01 (club spec DD-23, REQ-025; #29). Sessionless; the server reads it through
 * the public API, so its HTML holds the club without JavaScript, and titles it "{club} — Club page" (#487).
 */
export default async function PublicClubRoute({ params }: Props) {
  const clubSlug = params?.clubSlug ?? ''
  return <PublicClubView clubSlug={clubSlug} initial={await loadPublicClub(clubSlug)} />
}

PublicClubRoute.generateMetadata = ({ params }: Props) => publicClubMetadata(params?.clubSlug ?? '')
