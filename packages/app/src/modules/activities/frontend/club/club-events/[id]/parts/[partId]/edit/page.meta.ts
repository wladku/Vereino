import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/club-events/[id]/parts/[partId]/edit` — a part of a club event on the phone (REQ-T02, REQ-T12, #380). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.manage'],
  title: 'Edit part',
  titleKey: 'activities.clubEvents.part.editTitle',
}

export default metadata
