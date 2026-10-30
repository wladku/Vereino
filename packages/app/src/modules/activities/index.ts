import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'activities',
  title: 'Activities',
  version: '0.1.0',
  description:
    'Activities of both group kinds: weekly series generated for a 16-week horizon, detached sessions, place and coach conflicts, one-off events for a coach own group, and cancellations with an in-app notice (#31).',
  author: 'Vereino',
  license: 'MIT',
  // Club spec *Architecture*: `activities` → `groups` → `people` → `club_core`; all are reached only through DI and ids.
  requires: ['groups', 'club_core', 'people'],
}
