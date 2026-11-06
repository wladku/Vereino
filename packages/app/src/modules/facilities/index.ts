import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'facilities',
  title: 'Facilities',
  version: '0.1.0',
  description:
    'Municipal facility administration (facilities spec, phase 5): zones, closures, rental rates and bulk booking availability (#121); rentals, bookings, the public calendar, the log and maintenance follow.',
  author: 'Vereino',
  license: 'MIT',
  // Facilities spec *Architecture*: sessions of `activities`, places and settings of `club_core`, `people` for the
  // record scope; all are reached only through DI and ids. `payments` stays optional (DD-19).
  requires: ['activities', 'club_core', 'people'],
}
