// B-30 Order campaigns (UX concept README B-30; payments spec REQ-032; issue #115): the sidebar entry of the kit
// order forms.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.orders.manage'],
  pageTitle: 'Order campaigns',
  pageTitleKey: 'payments.orders.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  pageOrder: 30,
  icon: 'shopping-bag',
  breadcrumb: [{ label: 'Order campaigns', labelKey: 'payments.orders.title' }],
}
