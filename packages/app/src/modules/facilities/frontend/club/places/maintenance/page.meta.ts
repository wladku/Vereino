import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/places/maintenance` — the tasks of the places a person maintains, on the phone (REQ-R15, J-R07; #283). The
 * page itself asks only for a signed-in user: its reads require `facilities.maintenance.manage`, and a 403 shows the
 * page's own refusal, which names who maintains a place and how one is assigned, instead of the platform's bare "Access
 * denied" (E20-S10, #489).
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  title: 'Maintenance',
  titleKey: 'facilities.places.maintenance.title',
}

export default metadata
