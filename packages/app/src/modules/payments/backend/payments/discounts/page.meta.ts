// The Discounts tab of B-20: reached through the tabs on `/backend/payments/fees`, so it has no sidebar entry.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.manage'],
  pageTitle: 'Discounts',
  pageTitleKey: 'payments.discounts.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Fees and discounts', labelKey: 'payments.fees.title', href: '/backend/payments/fees' },
    { label: 'Discounts', labelKey: 'payments.discounts.title' },
  ],
}
