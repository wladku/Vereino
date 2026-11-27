import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/i/[token]` — sessionless page of a personal invitation link (personal invitation link spec REQ-IL03,
 * REQ-IL04, DD-35; #868).
 */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Invitation',
  titleKey: 'people.invitationLink.page.title',
}

export default metadata
