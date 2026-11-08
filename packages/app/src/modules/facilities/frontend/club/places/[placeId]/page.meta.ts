import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/places/[placeId]` — one place's day timeline with zones and blocks, booking and cancelling (M-11; #123). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view'],
  title: 'Facility',
  titleKey: 'facilities.places.detail.title',
}

export default metadata
