// `/backend/facilities/closures` (facilities spec B-26; #121).
// The "Closures" tab of B-26 "Zones and rates" (navigation spec REQ-N02; #256): reached through the tabs on
// `/backend/facilities/zones`, so it has no sidebar entry of its own; the title and breadcrumb name the page.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.view'],
  pageTitle: 'Zones and rates',
  pageTitleKey: 'facilities.rules.title',
  pageGroup: 'Facility',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 30,
  icon: 'calendar-off',
  navHidden: true,
  breadcrumb: [{ label: 'Zones and rates', labelKey: 'facilities.rules.title', href: '/backend/facilities/zones' }],
}
