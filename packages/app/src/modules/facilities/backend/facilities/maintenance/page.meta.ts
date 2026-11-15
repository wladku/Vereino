// `/backend/facilities/maintenance` (facilities spec B-27 maintenance tab; REQ-022, DD-36; #128).
// The "Maintenance" tab of B-27 "Log and incidents" (navigation spec REQ-N02; #256): reached through the tabs on
// `/backend/facilities/logs`, so it has no sidebar entry of its own; the title and breadcrumb name the page.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.maintenance.manage'],
  pageTitle: 'Log and incidents',
  pageTitleKey: 'facilities.records.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 65,
  icon: 'wrench',
  navHidden: true,
  breadcrumb: [{ label: 'Log and incidents', labelKey: 'facilities.records.title', href: '/backend/facilities/logs' }],
}
