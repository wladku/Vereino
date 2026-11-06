import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/events/new` — a coach creates a one-off event for their own group from the phone (REQ-027, #140). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.events.create'],
  title: 'New event',
  titleKey: 'activities.club.event.title',
}

export default metadata
