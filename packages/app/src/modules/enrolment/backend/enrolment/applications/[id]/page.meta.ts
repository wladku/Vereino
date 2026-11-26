// `/backend/enrolment/applications/[id]` (sign-up form spec B-J1, M-J3; #799): one application in the back office.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['enrolment.applications.view'],
  pageTitle: 'Application',
  pageTitleKey: 'enrolment.club.detail.title',
  pageGroup: 'People',
  pageGroupKey: 'people.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Applications', labelKey: 'enrolment.backend.title', href: '/backend/enrolment/applications' },
    { label: 'Application', labelKey: 'enrolment.club.detail.title' },
  ],
}
