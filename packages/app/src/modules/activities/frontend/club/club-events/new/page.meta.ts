import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/club-events/new` — a new club event from the phone (club events spec REQ-T01, REQ-T12, E14-S05 #380). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.manage'],
  title: 'New club event',
  titleKey: 'activities.clubEvents.create.title',
}

export default metadata
