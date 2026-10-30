import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/sections/[sectionSlug]` — sessionless public section page (club spec DD-23, DD-28, REQ-025; #29). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Section page',
  titleKey: 'club_core.public.sectionPageTitle',
}

export default metadata
