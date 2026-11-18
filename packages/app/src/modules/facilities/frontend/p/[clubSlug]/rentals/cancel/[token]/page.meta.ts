import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/rentals/cancel/[token]` — sessionless cancellation of a rental by its renter (REQ-R17; #286). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Cancel a booking',
  titleKey: 'facilities.public.cancel.pageTitle',
}

export default metadata
