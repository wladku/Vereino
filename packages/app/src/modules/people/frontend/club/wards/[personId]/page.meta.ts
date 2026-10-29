import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/wards/[personId]` — one ward of the signed-in guardian with the consents (club spec UI row; #27). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'Ward',
  titleKey: 'people.club.ward.pageTitle',
}

export default metadata
