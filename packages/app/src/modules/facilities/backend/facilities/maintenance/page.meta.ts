// `/backend/facilities/maintenance` (facilities spec B-27 maintenance tab; REQ-022, DD-36; #128).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.maintenance.manage'],
  pageTitle: 'Maintenance',
  pageTitleKey: 'facilities.maintenance.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  pageOrder: 65,
  icon: 'wrench',
  breadcrumb: [{ label: 'Maintenance', labelKey: 'facilities.maintenance.title' }],
}
