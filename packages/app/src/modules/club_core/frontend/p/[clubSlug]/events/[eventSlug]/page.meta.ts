import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/events/[eventSlug]` — sessionless tournament page P-T1 (club events spec DD-T11, DD-T13; #381). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Event',
  titleKey: 'club_core.public.clubEvent.pageTitle',
}

export default metadata
