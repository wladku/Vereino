import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'enrolment',
  title: 'Enrolment',
  version: '0.1.0',
  description:
    'Section sign-up form (sign-up form spec, phase 2, #799): a public three-step application with the age hint, e-mail confirmation and a status link; the coordinator’s inbox with flags, numbered waiting lists and the decisions reject and waiting list; retention of applicants’ data.',
  author: 'Vereino',
  license: 'AGPL-3.0-only',
  // Sign-up form spec DD-J01: the club, the section and the settings from `club_core`, the groups and their places from
  // `groups` (`groups.applicationTargets`), the coordinators and the possible duplicates from `people`.
  requires: ['club_core', 'people', 'groups'],
}
