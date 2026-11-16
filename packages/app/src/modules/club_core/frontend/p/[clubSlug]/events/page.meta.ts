import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/events` — sessionless public Events page P-06 (navigation spec REQ-N13, DD-23, DD-35; #263). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Events',
  titleKey: 'club_core.public.events.pageTitle',
}

export default metadata
