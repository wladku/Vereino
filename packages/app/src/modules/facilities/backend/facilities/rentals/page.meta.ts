// `/backend/facilities/rentals` (facilities spec B-24; #122).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.rentals.manage'],
  pageTitle: 'Rentals',
  pageTitleKey: 'facilities.rentals.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 15,
  icon: 'ticket',
  breadcrumb: [{ label: 'Rentals', labelKey: 'facilities.rentals.title' }],
}
