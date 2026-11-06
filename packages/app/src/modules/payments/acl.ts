// ACL features of `payments` used by phase 4 step 2 (payments spec *Users, Permissions, and Scope*; issue #108). The
// club administrator holds them through `payments.*` (`@vereino/core` `roleCatalogue`); the treasurer role (DD-33)
// is held back (A02, D-030). The cash, statement, order and coach features arrive with their steps.
export const features = [
  { id: 'payments.view', title: 'View charges', module: 'payments' },
  {
    id: 'payments.manage',
    title: 'Manage fee schedules, discounts, payment settings and charge generation',
    module: 'payments',
    dependsOn: ['payments.view'],
  },
]

export default features
