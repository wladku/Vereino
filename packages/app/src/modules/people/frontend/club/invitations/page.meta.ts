import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/invitations` — the families with a pending account invitation a coach or coordinator shares personal links
 * with, on the phone (personal invitation link spec REQ-IL02, J-IL01; #868); the reach of
 * `GET /api/people/invitations/pending` decides which families are listed.
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['people.self', 'people.invitations.share'],
  title: 'Invitations',
  titleKey: 'people.invitationLink.list.pageTitle',
}

export default metadata
