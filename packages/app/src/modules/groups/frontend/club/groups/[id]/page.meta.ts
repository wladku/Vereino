import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/groups/[id]` — a group's roster on the phone (groups and activities parity spec REQ-A11, J-A01 step 4, #274):
 * a section coordinator edits it with `groups.manage`, a coach reads their own group's roster; the group read and the
 * membership commands decide the scope.
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'groups.view'],
  title: 'Roster',
  titleKey: 'groups.club.roster.title',
}

export default metadata
