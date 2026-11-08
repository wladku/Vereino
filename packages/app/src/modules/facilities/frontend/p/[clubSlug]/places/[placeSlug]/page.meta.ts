import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/places/[placeSlug]` — sessionless public month of one facility (facilities spec P-04; #124). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Facility calendar',
  titleKey: 'facilities.public.schedule.pageTitle',
}

export default metadata
