import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/club-events/[id]/parts/new` — a new part (or a copy, `?copyOf=`) on the phone (REQ-T02, REQ-T12, #380). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.manage'],
  title: 'New part',
  titleKey: 'activities.clubEvents.part.createTitle',
}

export default metadata
