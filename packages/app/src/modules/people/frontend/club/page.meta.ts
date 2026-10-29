import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club` — "Today" of the member interface (club spec DD-05, `/club` UI row; #27). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'Today',
  titleKey: 'people.club.today.pageTitle',
}

export default metadata
