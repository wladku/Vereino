import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/applications` — the coordinator's applications on the phone (sign-up form spec M-J2, #799). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['enrolment.applications.view'],
  title: 'Applications',
  titleKey: 'enrolment.club.list.title',
}

export default metadata
