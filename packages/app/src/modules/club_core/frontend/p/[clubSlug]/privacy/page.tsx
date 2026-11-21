import { PublicPrivacyView } from '../../../../components/public/PublicPrivacyView'
import { loadPublicClub, publicPrivacyMetadata } from '../../../../components/public/public-server'

type Props = { params?: { clubSlug?: string } }

/**
 * `/p/[clubSlug]/privacy` — the club's default privacy notice (E19-S03, #469). Sessionless; the server reads the club
 * through the public club API, so the HTML holds the notice with the club's name without JavaScript, titled
 * "{club} — Privacy policy".
 */
export default async function PublicPrivacyRoute({ params }: Props) {
  const clubSlug = params?.clubSlug ?? ''
  return <PublicPrivacyView clubSlug={clubSlug} initial={await loadPublicClub(clubSlug)} />
}

PublicPrivacyRoute.generateMetadata = ({ params }: Props) => publicPrivacyMetadata(params?.clubSlug ?? '')
