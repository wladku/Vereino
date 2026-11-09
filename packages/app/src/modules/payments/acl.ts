// ACL features of `payments` used by phase 4 steps 2, 3, 4, 8 and 9 (payments spec *Users, Permissions, and Scope*;
// issues #108, #109, #110, #114, #115). The club administrator holds them through `payments.*` (`@vereino/core`
// `roleCatalogue`); the payer role `vereino_payer` holds `payments.view_own` and `payments.pay_online` (a minor never
// passes the R10 gate `people.paymentsGate`, even with the feature). The treasurer role (DD-33) is held back (A02,
// D-030). `payments.cash.record` is "Accept cash" (REQ-031); its command still requires the club administrator's grant,
// like every `payments` write of phase 4 — the treasurer's grant arrives with DD-33 and the coach's own path
// (`payments.groups.collect`, DD-31, DD-32) with E07-S10 (#117). `payments.orders.manage` is the order campaigns of
// E07-S08 (#115), also the club administrator's only. `payments.bank.import` is the statement import of E07-S06 (#113):
// the file, its transfers and the decisions on them, the club administrator's only until DD-33.
// `payments.orders.place` is the guardian's kit order of E07-S09 (#116), held by `vereino_payer`. The coach features
// arrive with their steps.
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
  { id: 'payments.cash.record', title: 'Accept cash with a numbered receipt', module: 'payments' },
  {
    id: 'payments.bank.import',
    title: 'Import bank statements and decide on the matched transfers',
    module: 'payments',
    dependsOn: ['payments.view'],
  },
  {
    id: 'payments.orders.manage',
    title: 'Manage order campaigns (kit order forms, stages, supplier summary, reminders)',
    module: 'payments',
    dependsOn: ['payments.view'],
  },
  {
    id: 'payments.orders.place',
    title: 'Order kit for my children (and myself) and change or cancel the order before the deadline',
    module: 'payments',
    dependsOn: ['payments.view_own'],
  },
]

export default features
