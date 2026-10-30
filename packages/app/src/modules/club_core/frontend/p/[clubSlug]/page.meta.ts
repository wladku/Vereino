import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]` — sessionless public club page (club spec DD-23, DD-35, REQ-025; #29). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Club page',
  titleKey: 'club_core.public.pageTitle',
}

export default metadata
