import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/events/new` — a coach creates a one-off event for their own group from the phone (REQ-027, #140). The page
 * asks only for a member; its read (`GET /api/activities/events/options`) and `POST /api/activities/events` require
 * `activities.events.create`, and the page answers a 403 or no group with its own refusal naming the way forward
 * instead of the platform's bare "Access denied" (E20-S10, #489).
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'New event',
  titleKey: 'activities.club.event.title',
}

export default metadata
