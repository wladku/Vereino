// ACL features of `payments` used by phase 4 steps 2 to 4 (payments spec *Users, Permissions, and Scope*; issues
// #108, #109, #110). The club administrator holds them through `payments.*` (`@vereino/core` `roleCatalogue`); the
// payer role `vereino_payer` holds `payments.view_own` and `payments.pay_online` (a minor never passes the R10 gate
// `people.paymentsGate`, even with the feature). The treasurer role (DD-33) is held back (A02, D-030). The cash,
// statement, order and coach features arrive with their steps.
export const features = [
  { id: 'payments.view', title: 'View charges', module: 'payments' },
  {
    id: 'payments.manage',
    title: 'Manage fee schedules, discounts, payment settings, charge generation and online refunds',
    module: 'payments',
    dependsOn: ['payments.view'],
  },
  { id: 'payments.view_own', title: 'View the charges I pay', module: 'payments' },
  {
    id: 'payments.pay_online',
    title: 'Pay my charges online',
    module: 'payments',
    dependsOn: ['payments.view_own'],
  },
]

export default features
