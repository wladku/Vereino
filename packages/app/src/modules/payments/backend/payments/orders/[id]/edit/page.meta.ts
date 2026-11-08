// B-31 Edit order form (UX concept README B-31; issue #115): only in draft or open.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.orders.manage'],
  pageTitle: 'Edit order form',
  pageTitleKey: 'payments.orders.edit.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  navHidden: true,
  breadcrumb: [
    { label: 'Order campaigns', labelKey: 'payments.orders.title', href: '/backend/payments/orders' },
    { label: 'Edit order form', labelKey: 'payments.orders.edit.title' },
  ],
}
