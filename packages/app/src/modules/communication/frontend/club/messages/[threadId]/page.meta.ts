import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/messages/[threadId]` — a member's thread (foundation III REQ-M06, REQ-M10; #35). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['communication.view'],
  title: 'Thread',
  titleKey: 'communication.club.thread.pageTitle',
}

export default metadata
