import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/privacy` — sessionless default privacy notice of a club (E19-S03, #469; S9.7). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Privacy policy',
  titleKey: 'club_core.privacy.title',
}

export default metadata
