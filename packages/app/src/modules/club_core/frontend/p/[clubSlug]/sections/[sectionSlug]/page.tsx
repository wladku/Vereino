import { PublicSectionView } from '../../../../../components/public/PublicSectionView'
import { loadPublicSection, publicSectionMetadata } from '../../../../../components/public/public-server'

type Props = { params?: { clubSlug?: string; sectionSlug?: string } }

/**
 * `/p/[clubSlug]/sections/[sectionSlug]` — the public section page P-02 (club spec DD-23; #29). Sessionless; the server
 * reads it through the public API, so its HTML holds the section without JavaScript, titled "{club} — {section}" (#487).
 */
export default async function PublicSectionRoute({ params }: Props) {
  const clubSlug = params?.clubSlug ?? ''
  const sectionSlug = params?.sectionSlug ?? ''
  return (
    <PublicSectionView
      clubSlug={clubSlug}
      sectionSlug={sectionSlug}
      initial={await loadPublicSection(clubSlug, sectionSlug)}
    />
  )
}

PublicSectionRoute.generateMetadata = ({ params }: Props) =>
  publicSectionMetadata(params?.clubSlug ?? '', params?.sectionSlug ?? '')
