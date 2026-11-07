// ACL features of `payments` used by phase 4 steps 2, 3 and 8 (payments spec *Users, Permissions, and Scope*; issues
// #108, #109, #114). The club administrator holds them through `payments.*` (`@vereino/core` `roleCatalogue`); the
// treasurer role (DD-33) is held back (A02, D-030). `payments.cash.record` is "Accept cash" (REQ-031); its command
// still requires the club administrator's grant, like every `payments` write of phase 4 — the treasurer's grant
// arrives with DD-33 and the coach's own path (`payments.groups.collect`, DD-31, DD-32) with E07-S10 (#117). The
// statement, order and coach features arrive with their steps.
export const features = [
  { id: 'payments.view', title: 'View charges', module: 'payments' },
  {
    id: 'payments.manage',
    title: 'Manage fee schedules, discounts, payment settings and charge generation',
    module: 'payments',
    dependsOn: ['payments.view'],
  },
  { id: 'payments.cash.record', title: 'Accept cash with a numbered receipt', module: 'payments' },
]

export default features
