export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.manage'],
  pageTitle: 'New zone rule',
  pageTitleKey: 'facilities.zones.create.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Zones', labelKey: 'facilities.zones.title', href: '/backend/facilities/zones' },
    { label: 'New zone rule', labelKey: 'facilities.zones.create.title' },
  ],
}
