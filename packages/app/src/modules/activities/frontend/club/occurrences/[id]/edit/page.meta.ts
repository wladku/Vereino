import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/occurrences/[id]/edit` — the coach edits the session of their own one-off event from the phone (REQ-A08,
 * DD-A05, #270); the session read's `mayEdit` and the update command decide which session they may edit.
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'activities.coach'],
  title: 'Edit session',
  titleKey: 'activities.club.edit.title',
}

export default metadata
