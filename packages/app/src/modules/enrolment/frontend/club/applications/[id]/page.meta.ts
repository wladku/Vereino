import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/applications/[id]` — one application, decided on the phone (sign-up form spec M-J3, #799). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['enrolment.applications.view'],
  title: 'Application',
  titleKey: 'enrolment.club.detail.title',
}

export default metadata
