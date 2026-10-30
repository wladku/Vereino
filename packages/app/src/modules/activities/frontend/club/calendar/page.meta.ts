import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/calendar` — the member calendar: own sessions, every ward's, or a coach's groups (club spec UI row; #32). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'Calendar',
  titleKey: 'activities.club.calendar.title',
}

export default metadata
