import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/messages/new` — a member writes to the coaches or the coordinator (foundation III REQ-M12, DD-M18; #138). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['communication.view'],
  title: 'Write to the coach',
  titleKey: 'communication.direct.title',
}

export default metadata
