// `/backend/facilities/reports/owner` (facilities spec B-28, flow F-12; REQ-015; #127).
// B-28 "Municipality report" (navigation spec REQ-N02; #256): the menu item of the page, its first tab "Municipality report".
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.reports.view'],
  pageTitle: 'Municipality report',
  pageTitleKey: 'facilities.reports.owner.title',
  pageGroup: 'Facility',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 70,
  icon: 'file-bar-chart',
  breadcrumb: [{ label: 'Municipality report', labelKey: 'facilities.reports.owner.title' }],
}
