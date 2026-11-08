// B-31 New order form (UX concept README B-31; issue #115).
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.orders.manage'],
  pageTitle: 'New order form',
  pageTitleKey: 'payments.orders.create.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Order campaigns', labelKey: 'payments.orders.title', href: '/backend/payments/orders' },
    { label: 'New order form', labelKey: 'payments.orders.create.title' },
  ],
}
