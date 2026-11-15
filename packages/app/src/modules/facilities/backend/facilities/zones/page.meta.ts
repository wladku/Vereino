// `/backend/facilities/zones` (facilities spec B-26; #121).
// B-26 "Zones and rates" (navigation spec REQ-N02; #256): the menu item of the page, its first tab "Zones".
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view'],
  pageTitle: 'Zones and rates',
  pageTitleKey: 'facilities.rules.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 20,
  icon: 'grid-3x3',
  breadcrumb: [{ label: 'Zones and rates', labelKey: 'facilities.rules.title' }],
}
