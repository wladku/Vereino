import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/messages` — the member inbox (foundation III REQ-M10; club spec UI row `/club/messages`; #35). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['communication.view'],
  title: 'Messages',
  titleKey: 'communication.club.title',
}

export default metadata
