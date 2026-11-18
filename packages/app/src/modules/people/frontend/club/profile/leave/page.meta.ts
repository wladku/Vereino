import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/profile/leave` — ask to leave the club for oneself and one's wards (people life-cycle spec REQ-L03; #306). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'Leave the club',
  titleKey: 'people.club.leave.title',
}

export default metadata
