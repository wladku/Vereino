// `/backend/facilities/closures` (facilities spec B-26; #121).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view'],
  pageTitle: 'Closures',
  pageTitleKey: 'facilities.closures.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 30,
  icon: 'calendar-off',
  breadcrumb: [{ label: 'Closures', labelKey: 'facilities.closures.title' }],
}
