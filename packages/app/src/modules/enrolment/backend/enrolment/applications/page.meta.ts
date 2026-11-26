// `/backend/enrolment/applications` (sign-up form spec B-J1, REQ-J10, REQ-J17; #799): the applications to the club's
// sections the caller decides, by tab, with the section, overdue and name filters.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['enrolment.applications.view'],
  pageTitle: 'Applications',
  pageTitleKey: 'enrolment.backend.title',
  pageGroup: 'People',
  pageGroupKey: 'people.nav.group',
  pageOrder: 15,
  icon: 'inbox',
  breadcrumb: [{ label: 'Applications', labelKey: 'enrolment.backend.title' }],
}
