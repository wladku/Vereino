import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/occurrences/[id]/attendance` — the coach's attendance list of a session (club spec UI row; #33). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['activities.coach'],
  title: 'Attendance list',
  titleKey: 'activities.club.attendance.pageTitle',
}

export default metadata
