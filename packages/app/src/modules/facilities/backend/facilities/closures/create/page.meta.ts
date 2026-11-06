export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.manage'],
  pageTitle: 'New closure',
  pageTitleKey: 'facilities.closures.create.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Closures', labelKey: 'facilities.closures.title', href: '/backend/facilities/closures' },
    { label: 'New closure', labelKey: 'facilities.closures.create.title' },
  ],
}
