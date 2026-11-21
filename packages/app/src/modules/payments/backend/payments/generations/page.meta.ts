// The generation list (owner decision (a) on #403): every charge generation, with Undo; reached from B-21 Charges.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.manage'],
  pageTitle: 'Generations',
  pageTitleKey: 'payments.generations.title',
  pageGroup: 'Finance',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Charges', labelKey: 'payments.charges.title', href: '/backend/payments/charges' },
    { label: 'Generations', labelKey: 'payments.generations.title' },
  ],
}
