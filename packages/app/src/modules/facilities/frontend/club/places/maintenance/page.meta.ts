import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/places/maintenance` — the tasks of the places a person maintains, on the phone (REQ-R15, J-R07; #283). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['facilities.maintenance.manage'],
  title: 'Maintenance',
  titleKey: 'facilities.places.maintenance.title',
}

export default metadata
