// The "Coaches and payments" tab of B-20: reached through the tabs on `/backend/payments/fees`.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.manage'],
  pageTitle: 'Coaches and payments',
  pageTitleKey: 'payments.settings.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Fees and discounts', labelKey: 'payments.fees.title', href: '/backend/payments/fees' },
    { label: 'Coaches and payments', labelKey: 'payments.settings.title' },
  ],
}
