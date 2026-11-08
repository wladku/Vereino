// B-29 Bank statement (UX concept README B-29; payments spec REQ-030; issue #113): statement import, the queue of
// matched transfers by perspective and the import history.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.bank.import'],
  pageTitle: 'Bank statement',
  pageTitleKey: 'payments.bank.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  pageOrder: 25,
  icon: 'landmark',
  breadcrumb: [{ label: 'Bank statement', labelKey: 'payments.bank.title' }],
}
