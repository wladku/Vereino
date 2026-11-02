import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'communication',
  title: 'Communication',
  version: '0.1.0',
  description:
    'Announcements to the club, a section, a group, an activity or a session with an in-app notification and an e-mail, replies, the session-cancellation thread, the share text and the member inbox (foundation III phase B, #35).',
  author: 'Vereino',
  license: 'MIT',
  // Club spec *Architecture*: `communication` reaches `people`, `groups` and `club_core` only through DI and ids;
  // `activities` is optional (`activities.scheduleDirectory`, `activities.shareText` read with `hasRegistration`).
  requires: ['people', 'groups', 'club_core'],
}
