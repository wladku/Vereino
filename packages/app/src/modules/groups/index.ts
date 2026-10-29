import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'groups',
  title: 'Groups',
  version: '0.1.0',
  description:
    'Groups of both kinds (team and class group) with memberships over time, seasons and external teams; the coach scope of coach and assistant memberships (#30).',
  author: 'Vereino',
  license: 'MIT',
  // Club spec *Architecture*: `groups` → `people` → `club_core`; both are reached only through DI and ids.
  requires: ['people', 'club_core'],
}
