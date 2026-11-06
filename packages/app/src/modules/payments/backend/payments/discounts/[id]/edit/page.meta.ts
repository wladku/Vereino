export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.manage'],
  pageTitle: 'Edit discount rule',
  pageTitleKey: 'payments.discounts.edit.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Fees and discounts', labelKey: 'payments.fees.title', href: '/backend/payments/fees' },
    { label: 'Discounts', labelKey: 'payments.discounts.title', href: '/backend/payments/discounts' },
    { label: 'Edit discount rule', labelKey: 'payments.discounts.edit.title' },
  ],
}
