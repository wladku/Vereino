import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/groups` — a section coordinator's groups, or a coach's own groups, on the phone (groups and activities parity
 * spec REQ-A11, #274); the record scope of `GET /api/groups/groups` decides which groups are listed.
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'groups.view'],
  title: 'Groups',
  titleKey: 'groups.club.title',
}

export default metadata
