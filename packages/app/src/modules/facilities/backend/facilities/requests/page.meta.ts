// `/backend/facilities/requests` (facilities spec B-25; #125): the online booking requests awaiting approval.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view', 'facilities.rentals.approve'],
  pageTitle: 'Booking requests',
  pageTitleKey: 'facilities.requests.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 16,
  icon: 'inbox',
  breadcrumb: [{ label: 'Booking requests', labelKey: 'facilities.requests.title' }],
}
