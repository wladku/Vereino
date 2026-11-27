import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/profile/password` — the member changes their own password in the member app (#876; README M-10). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'Change password',
  titleKey: 'people.club.password.title',
}

export default metadata
