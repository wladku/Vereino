import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/facility` — today at the facility: the log, today's groups, incidents, no-shows (README M-12; #126). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['facilities.log.write'],
  title: 'Today at the facility',
  titleKey: 'facilities.facility.title',
}

export default metadata
