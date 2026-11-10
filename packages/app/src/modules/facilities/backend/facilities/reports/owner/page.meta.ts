// `/backend/facilities/reports/owner` (facilities spec B-28, flow F-12; REQ-015; #127).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.reports.view'],
  pageTitle: 'Municipality report',
  pageTitleKey: 'facilities.reports.owner.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 70,
  icon: 'file-bar-chart',
  breadcrumb: [{ label: 'Municipality report', labelKey: 'facilities.reports.owner.title' }],
}
