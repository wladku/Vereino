// Error codes owned by `groups` (engineering standards S6.7; club spec glossary *Group* and *Membership*, the
// `/api/groups/*` row of *API, Command, and Error Contracts*). Thrown through `api/errors.ts`. An inverted membership
// period answers the foundation's `validity_inverted`; a stale lock token the platform's `optimistic_lock_conflict`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  {
    code: 'group_team_fields_on_class_group',
    status: 422,
    messageKey: 'groups.errors.group_team_fields_on_class_group',
  },
  { code: 'groups_reference_invalid', status: 422, messageKey: 'groups.errors.groups_reference_invalid' },
  { code: 'group_section_inactive', status: 422, messageKey: 'groups.errors.group_section_inactive' },
  { code: 'group_has_memberships', status: 409, messageKey: 'groups.errors.group_has_memberships' },
  { code: 'membership_overlap', status: 409, messageKey: 'groups.errors.membership_overlap' },
  { code: 'season_dates_inverted', status: 422, messageKey: 'groups.errors.season_dates_inverted' },
  { code: 'season_name_taken', status: 409, messageKey: 'groups.errors.season_name_taken' },
  { code: 'season_in_use', status: 409, messageKey: 'groups.errors.season_in_use' },
] as const satisfies ErrorCodeTable

export type GroupsErrorCode = (typeof errorCodes)[number]['code']
