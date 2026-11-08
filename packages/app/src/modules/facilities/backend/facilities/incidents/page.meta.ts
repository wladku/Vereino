// `/backend/facilities/incidents` (facilities spec B-27; #126).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.log.write'],
  pageTitle: 'Incidents',
  pageTitleKey: 'facilities.records.incidents.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 55,
  icon: 'triangle-alert',
  breadcrumb: [{ label: 'Incidents', labelKey: 'facilities.records.incidents.title' }],
}
