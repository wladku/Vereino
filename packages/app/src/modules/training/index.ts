import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'training',
  title: 'Training',
  version: '0.1.0',
  description:
    'Training outlines in the PZPN template (training outlines spec, phase 2, #683): written on the phone, attached to a session or a recurring activity (each session gets its own copy), shown on the session page and printed as a PDF in the PZPN layout.',
  author: 'Vereino',
  license: 'AGPL-3.0-only',
  // Training outlines spec DD-O05, DD-O07a: the coach's person and groups from `people` and `groups`, the club from
  // `club_core`; sessions come from `activities` through its optional DI contract `activities.occurrenceFacts`.
  requires: ['club_core', 'people', 'groups'],
}
