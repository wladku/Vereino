// B-33 Cash to settle (UX concept README B-33; payments spec REQ-033; issue #118): the cash held by collectors, "Accept
// handover" and the handover history. The club administrator's until the treasurer role (#245).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.cash.settle'],
  pageTitle: 'Cash to settle',
  pageTitleKey: 'payments.cashCustody.title',
  pageGroup: 'Finance',
  pageGroupKey: 'payments.nav.group',
  pageOrder: 40,
  icon: 'hand-coins',
  breadcrumb: [{ label: 'Cash to settle', labelKey: 'payments.cashCustody.title' }],
}
