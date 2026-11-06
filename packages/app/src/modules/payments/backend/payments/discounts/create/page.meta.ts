export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.manage'],
  pageTitle: 'New discount rule',
  pageTitleKey: 'payments.discounts.create.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Fees and discounts', labelKey: 'payments.fees.title', href: '/backend/payments/fees' },
    { label: 'Discounts', labelKey: 'payments.discounts.title', href: '/backend/payments/discounts' },
    { label: 'New discount rule', labelKey: 'payments.discounts.create.title' },
  ],
}
