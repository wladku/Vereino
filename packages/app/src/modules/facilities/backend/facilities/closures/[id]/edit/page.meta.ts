export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.manage'],
  pageTitle: 'Edit closure',
  pageTitleKey: 'facilities.closures.edit.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Closures', labelKey: 'facilities.closures.title', href: '/backend/facilities/closures' },
    { label: 'Edit closure', labelKey: 'facilities.closures.edit.title' },
  ],
}
