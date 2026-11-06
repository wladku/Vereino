// B-22 Charge (UX concept README B-22; issue #109): one charge with its payments, recording and cancellation.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.view'],
  pageTitle: 'Charge',
  pageTitleKey: 'payments.ledger.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Charges', labelKey: 'payments.charges.title', href: '/backend/payments/charges' },
    { label: 'Charge', labelKey: 'payments.ledger.title' },
  ],
}
