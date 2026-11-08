import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/places` — the club's facilities with today's occupancy (README M-11; REQ-023; #123). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view'],
  title: 'Facilities',
  titleKey: 'facilities.places.title',
}

export default metadata
