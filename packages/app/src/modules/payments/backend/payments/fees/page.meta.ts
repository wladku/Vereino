// B-20 Fees and discounts (UX concept README B-20; issue #108): the sidebar entry of the payment settings.
export const metadata = {
  requireAuth: true,
  requireFeatures: ['payments.manage'],
  pageTitle: 'Fees and discounts',
  pageTitleKey: 'payments.fees.title',
  pageGroup: 'Payments',
  pageGroupKey: 'payments.nav.group',
  pageOrder: 10,
  icon: 'wallet',
  breadcrumb: [{ label: 'Fees and discounts', labelKey: 'payments.fees.title' }],
}
