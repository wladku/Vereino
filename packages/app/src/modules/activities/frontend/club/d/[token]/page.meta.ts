import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/d/[token]` — sessionless declaration from a personal link (club spec REQ-017, DD-35; UX concept M-14). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Attendance',
  titleKey: 'activities.declarationLink.pageTitle',
}

export default metadata
