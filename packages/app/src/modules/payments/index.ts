import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'payments',
  title: 'Payments',
  version: '0.1.0',
  description:
    'Club payments, phase 4 step 2 (#108): fee schedules, discount rules, the "Coaches and payments" setting and the idempotent period generator of membership-fee charges with the sibling discount.',
  author: 'Vereino',
  license: 'MIT',
  // Payments spec *Architecture*: the participants, payers and activities are reached only through DI and ids.
  requires: ['people', 'groups', 'activities', 'club_core'],
}
