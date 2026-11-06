// B-21 Charges (UX concept README B-21; issues #108, #109): perspectives, search, CSV export and period generation.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.view'],
  pageTitle: 'Charges',
  pageTitleKey: 'payments.charges.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  pageOrder: 20,
  icon: 'receipt',
  breadcrumb: [{ label: 'Charges', labelKey: 'payments.charges.title' }],
}
