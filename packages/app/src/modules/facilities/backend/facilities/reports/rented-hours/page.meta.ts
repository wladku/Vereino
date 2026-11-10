// `/backend/facilities/reports/rented-hours` (facilities spec REQ-038, the rented-hours row of *UI*; #129).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.reports.view'],
  pageTitle: 'Rented hours',
  pageTitleKey: 'facilities.reports.rentedHours.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 71,
  icon: 'clock',
  breadcrumb: [{ label: 'Rented hours', labelKey: 'facilities.reports.rentedHours.title' }],
}
