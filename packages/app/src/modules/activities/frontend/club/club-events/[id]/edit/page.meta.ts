import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/club-events/[id]/edit` — the club event form on the phone (REQ-T01, REQ-T12, E14-S05 #380). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.manage'],
  title: 'Edit club event',
  titleKey: 'activities.clubEvents.club.form.editTitle',
}

export default metadata
