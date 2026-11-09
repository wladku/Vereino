import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/places` — sessionless list of the club's facilities with a public calendar (facilities spec P-03; #124). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Facilities',
  titleKey: 'facilities.public.places.pageTitle',
}

export default metadata
