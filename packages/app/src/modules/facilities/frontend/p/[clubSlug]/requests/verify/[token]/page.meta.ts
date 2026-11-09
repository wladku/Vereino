import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/requests/verify/[token]` — sessionless confirmation of a booking request (facilities spec P-05; #125). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Booking request confirmation',
  titleKey: 'facilities.public.verify.pageTitle',
}

export default metadata
