// `/backend/facilities/rates` (facilities spec B-26; #121).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view'],
  pageTitle: 'Rental rates',
  pageTitleKey: 'facilities.rates.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 40,
  icon: 'coins',
  breadcrumb: [{ label: 'Rental rates', labelKey: 'facilities.rates.title' }],
}
