// B-32 Order campaign (UX concept README B-32; issue #115): stages, KPIs, orders, supplier summary, no order.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.orders.manage'],
  pageTitle: 'Order campaign',
  pageTitleKey: 'payments.orders.record.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Order campaigns', labelKey: 'payments.orders.title', href: '/backend/payments/orders' },
    { label: 'Order campaign', labelKey: 'payments.orders.record.title' },
  ],
}
