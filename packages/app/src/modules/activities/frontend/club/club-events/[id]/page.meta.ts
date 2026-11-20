import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/club-events/[id]` — a club event with its parts by day and its files on the phone (REQ-T12, E14-S05 #380). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.manage'],
  title: 'Club event',
  titleKey: 'activities.clubEvents.record.title',
}

export default metadata
