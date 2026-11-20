import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/club-events` — the club events of a section coordinator or the administrator on the phone (club events spec REQ-T12, E14-S05 #380). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.manage'],
  title: 'Club events',
  titleKey: 'activities.clubEvents.title',
}

export default metadata
