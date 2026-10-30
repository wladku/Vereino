import { PublicSectionView } from '../../../../../components/public/PublicSectionView'

/** `/p/[clubSlug]/sections/[sectionSlug]` — the public section page (club spec DD-23, DD-28, REQ-025; #29). */
export default function PublicSectionRoute({ params }: { params?: { clubSlug?: string; sectionSlug?: string } }) {
  return <PublicSectionView clubSlug={params?.clubSlug ?? ''} sectionSlug={params?.sectionSlug ?? ''} />
}
