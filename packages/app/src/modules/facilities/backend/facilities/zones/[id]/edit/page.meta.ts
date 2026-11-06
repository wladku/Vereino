export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.manage'],
  pageTitle: 'Edit zone rule',
  pageTitleKey: 'facilities.zones.edit.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Zones', labelKey: 'facilities.zones.title', href: '/backend/facilities/zones' },
    { label: 'Edit zone rule', labelKey: 'facilities.zones.edit.title' },
  ],
}
