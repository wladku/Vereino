import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/places/[placeId]` — one place's day timeline with zones and blocks, booking and cancelling (M-11; #123). */
export const metadata: PageMetadata = {
  // `facilities.view` or `facilities.maintenance.manage` (a place maintainer, #128): the calendar API decides and a
  // 403 shows a permission-denied state on the page.
  requireAuth: true,
  title: 'Facility',
  titleKey: 'facilities.places.detail.title',
}

export default metadata
