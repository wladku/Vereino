export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.manage'],
  pageTitle: 'Edit rental rate',
  pageTitleKey: 'facilities.rates.edit.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Rental rates', labelKey: 'facilities.rates.title', href: '/backend/facilities/rates' },
    { label: 'Edit rental rate', labelKey: 'facilities.rates.edit.title' },
  ],
}
