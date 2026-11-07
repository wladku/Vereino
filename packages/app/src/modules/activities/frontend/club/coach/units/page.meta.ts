import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/coach/units` — "My units": a coach's own row of the monthly coach units report, on the phone (#96). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.reports.view_own'],
  title: 'My units',
  titleKey: 'activities.club.units.title',
}

export default metadata
