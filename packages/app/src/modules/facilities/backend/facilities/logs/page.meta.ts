// `/backend/facilities/logs` (facilities spec B-27; #126).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.log.write'],
  pageTitle: 'Facility log',
  pageTitleKey: 'facilities.records.logs.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 50,
  icon: 'clipboard-list',
  breadcrumb: [{ label: 'Facility log', labelKey: 'facilities.records.logs.title' }],
}
