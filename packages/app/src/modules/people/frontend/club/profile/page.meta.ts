import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/profile` — the member's language, contact details and consents (club spec UI row; #27). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'Profile',
  titleKey: 'people.club.profile.title',
}

export default metadata
