// Error codes owned by `groups` (engineering standards S6.7; club spec glossary *Group* and *Membership*, the
// `/api/groups/*` row of *API, Command, and Error Contracts*). Thrown through `api/errors.ts`. An inverted membership
// period answers the foundation's `validity_inverted` (an end before the start answers `membership_not_started`,
// parity spec REQ-A03); a stale lock token the platform's `optimistic_lock_conflict`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  {
    code: 'group_team_fields_on_class_group',
    status: 422,
    messageKey: 'groups.errors.group_team_fields_on_class_group',
  },
  { code: 'groups_reference_invalid', status: 422, messageKey: 'groups.errors.groups_reference_invalid' },
  { code: 'group_section_inactive', status: 422, messageKey: 'groups.errors.group_section_inactive' },
  { code: 'group_age_range_inverted', status: 422, messageKey: 'groups.errors.group_age_range_inverted' },
  { code: 'group_has_memberships', status: 409, messageKey: 'groups.errors.group_has_memberships' },
  { code: 'group_has_matches', status: 409, messageKey: 'groups.errors.group_has_matches' },
  { code: 'group_usage_failed', status: 503, messageKey: 'groups.errors.group_usage_failed' },
  { code: 'membership_overlap', status: 409, messageKey: 'groups.errors.membership_overlap' },
  { code: 'membership_in_use', status: 409, messageKey: 'groups.errors.membership_in_use' },
  { code: 'membership_not_started', status: 422, messageKey: 'groups.errors.membership_not_started' },
  { code: 'season_dates_inverted', status: 422, messageKey: 'groups.errors.season_dates_inverted' },
  { code: 'season_name_taken', status: 409, messageKey: 'groups.errors.season_name_taken' },
  { code: 'season_in_use', status: 409, messageKey: 'groups.errors.season_in_use' },
  // The season rollover (people life-cycle spec REQ-L08, *API* rows; #311).
  { code: 'rollover_plan_stale', status: 409, messageKey: 'groups.errors.rollover_plan_stale' },
  { code: 'rollover_conflicts', status: 409, messageKey: 'groups.errors.rollover_conflicts' },
  { code: 'rollover_plan_empty', status: 422, messageKey: 'groups.errors.rollover_plan_empty' },
  { code: 'rollover_same_season', status: 422, messageKey: 'groups.errors.rollover_same_season' },
  { code: 'rollover_season_overlap', status: 422, messageKey: 'groups.errors.rollover_season_overlap' },
  { code: 'rollover_group_unknown', status: 422, messageKey: 'groups.errors.rollover_group_unknown' },
  {
    code: 'rollover_group_action_duplicate',
    status: 422,
    messageKey: 'groups.errors.rollover_group_action_duplicate',
  },
  { code: 'rollover_name_required', status: 422, messageKey: 'groups.errors.rollover_name_required' },
  { code: 'rollover_record_unknown', status: 422, messageKey: 'groups.errors.rollover_record_unknown' },
  {
    code: 'rollover_record_action_duplicate',
    status: 422,
    messageKey: 'groups.errors.rollover_record_action_duplicate',
  },
  { code: 'rollover_copy_invalid', status: 422, messageKey: 'groups.errors.rollover_copy_invalid' },
  // Moving several children from a roster (people life-cycle spec REQ-L15, *API* row `groups.memberships.move_many`;
  // #383).
  { code: 'move_preview_stale', status: 409, messageKey: 'groups.errors.move_preview_stale' },
  { code: 'move_same_group', status: 422, messageKey: 'groups.errors.move_same_group' },
  { code: 'move_target_inactive', status: 422, messageKey: 'groups.errors.move_target_inactive' },
  { code: 'move_date_in_past', status: 422, messageKey: 'groups.errors.move_date_in_past' },
  { code: 'move_too_many', status: 422, messageKey: 'groups.errors.move_too_many' },
  // The "U" ranges of the age categories (people life-cycle spec REQ-L16, *API* rows; #384).
  { code: 'age_range_inverted', status: 422, messageKey: 'groups.errors.age_range_inverted' },
  { code: 'age_category_name_taken', status: 409, messageKey: 'groups.errors.age_category_name_taken' },
  { code: 'age_categories_missing', status: 422, messageKey: 'groups.errors.age_categories_missing' },
] as const satisfies ErrorCodeTable

export type GroupsErrorCode = (typeof errorCodes)[number]['code']
