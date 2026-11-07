import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'payments',
  title: 'Payments',
  version: '0.1.0',
  description:
    'Club payments, phase 4 steps 2, 3, 6 and 8 (#108, #109, #112, #114): fee schedules, discount rules, the "Coaches and payments" setting, the idempotent period generator of membership-fee charges with the sibling discount, the charge ledger (charges by perspective, cash and transfer payments, reversing entries and cancellation with a reason), "Accept cash" with numbered KP receipts and the public prices block of the section page.',
  author: 'Vereino',
  license: 'MIT',
  // Payments spec *Architecture*: the participants, payers and activities are reached only through DI and ids.
  requires: ['people', 'groups', 'activities', 'club_core'],
}
