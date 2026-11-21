import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/occurrences/[id]/edit` — the coach edits the session of their own one-off event from the phone (REQ-A08,
 * DD-A05, #270); the session read's `mayEdit` and the update command decide which session they may edit. The page
 * asks only for a member: the staff read requires `activities.coach` (403 otherwise), and the page answers every
 * refusal with its reason and the way forward instead of the platform's bare "Access denied" (E20-S10, #489).
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self'],
  title: 'Edit session',
  titleKey: 'activities.club.edit.title',
}

export default metadata
