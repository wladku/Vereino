import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/link` — sessionless personal link request (club spec REQ-017; UX concept M-13). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Personal link',
  titleKey: 'activities.linkRequest.pageTitle',
}

export default metadata
