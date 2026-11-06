export const metadata = {
  requireAuth: true,
  requireFeatures: ['facilities.manage'],
  pageTitle: 'New rental rate',
  pageTitleKey: 'facilities.rates.create.title',
  pageGroup: 'Facilities',
  pageGroupKey: 'facilities.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Rental rates', labelKey: 'facilities.rates.title', href: '/backend/facilities/rates' },
    { label: 'New rental rate', labelKey: 'facilities.rates.create.title' },
  ],
}
