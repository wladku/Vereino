export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.manage'],
  pageTitle: 'Edit fee schedule',
  pageTitleKey: 'payments.fees.edit.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Fees and discounts', labelKey: 'payments.fees.title', href: '/backend/payments/fees' },
    { label: 'Edit fee schedule', labelKey: 'payments.fees.edit.title' },
  ],
}
