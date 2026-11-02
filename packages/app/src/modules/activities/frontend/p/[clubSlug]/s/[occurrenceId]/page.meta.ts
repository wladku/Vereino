import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/p/[clubSlug]/s/[occurrenceId]` — sessionless public session page (club spec DD-17, DD-35; foundation III DD-M14). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Session',
  titleKey: 'activities.publicSession.pageTitle',
}

export default metadata
