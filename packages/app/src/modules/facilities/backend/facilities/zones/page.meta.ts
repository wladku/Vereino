// `/backend/facilities/zones` (facilities spec B-26; #121).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view'],
  pageTitle: 'Zones',
  pageTitleKey: 'facilities.zones.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 20,
  icon: 'grid-3x3',
  breadcrumb: [{ label: 'Zones', labelKey: 'facilities.zones.title' }],
}
