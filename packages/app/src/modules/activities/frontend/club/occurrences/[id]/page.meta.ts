import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/occurrences/[id]` — one session with the declarations of the member or the wards (club spec UI row; #32). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'Session',
  titleKey: 'activities.club.session.pageTitle',
}

export default metadata
