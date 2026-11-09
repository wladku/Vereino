import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/places` — the club's facilities with today's occupancy (README M-11; REQ-023; #123). */
export const metadata: PageMetadata = {
  // `facilities.view` or `facilities.maintenance.manage` (a place maintainer, #128): the calendar API decides and a
  // 403 shows a permission-denied state on the page.
  requireAuth: true,
  title: 'Facilities',
  titleKey: 'facilities.places.title',
}

export default metadata
