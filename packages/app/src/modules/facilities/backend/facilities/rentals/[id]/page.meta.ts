// `/backend/facilities/rentals/[id]` (facilities parity spec REQ-R05; #279): one rental, opened from B-24.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.rentals.manage'],
  pageTitle: 'Rental',
  pageTitleKey: 'facilities.rentals.record.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Rentals', labelKey: 'facilities.rentals.title', href: '/backend/facilities/rentals' },
    { label: 'Rental', labelKey: 'facilities.rentals.record.title' },
  ],
}
