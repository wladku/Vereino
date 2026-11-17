import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/facility/rentals/[id]` — one rental on the attendant's phone (facilities parity spec REQ-R14; #282). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['facilities.rentals.manage'],
  title: 'Rental',
  titleKey: 'facilities.rentals.record.title',
}

export default metadata
