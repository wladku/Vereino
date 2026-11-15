// `/backend/facilities/logs` (facilities spec B-27; #126).
// B-27 "Log and incidents" (navigation spec REQ-N02; #256): the menu item of the page, its first tab "Log".
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.log.write'],
  pageTitle: 'Log and incidents',
  pageTitleKey: 'facilities.records.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 50,
  icon: 'clipboard-list',
  breadcrumb: [{ label: 'Log and incidents', labelKey: 'facilities.records.title' }],
}
