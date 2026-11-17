// Error codes owned by `people` (engineering standards S6.7; club spec *API, Command, and Error Contracts*; foundation
// spec P-07). Thrown through `api/errors.ts`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'account_age_below_threshold', status: 422, messageKey: 'people.errors.account_age_below_threshold' },
  { code: 'account_birth_date_required', status: 422, messageKey: 'people.errors.account_birth_date_required' },
  { code: 'account_exists', status: 409, messageKey: 'people.errors.account_exists' },
  // People life-cycle spec phase L1 (REQ-L01, REQ-L02; #303): an account action on a person without an account in the
  // club, a re-send to an account that is not invited, the club's last active administrator, and closing an account
  // while an active role, guardianship or membership remains.
  { code: 'account_not_found', status: 404, messageKey: 'people.errors.account_not_found' },
  { code: 'invitation_not_pending', status: 409, messageKey: 'people.errors.invitation_not_pending' },
  { code: 'last_club_admin', status: 422, messageKey: 'people.errors.last_club_admin' },
  { code: 'account_has_purpose', status: 409, messageKey: 'people.errors.account_has_purpose' },
  // People life-cycle spec phase L3 (REQ-L13; #305): the panel's first administrator once the club has one (the
  // response names it), and a user who is not a user of the organization.
  { code: 'club_admin_exists', status: 409, messageKey: 'people.errors.club_admin_exists' },
  { code: 'user_not_in_organization', status: 404, messageKey: 'people.errors.user_not_in_organization' },
  { code: 'pesel_duplicate', status: 409, messageKey: 'people.errors.pesel_duplicate' },
  { code: 'pesel_invalid', status: 422, messageKey: 'people.errors.pesel_invalid' },
  // E06-S22 (#104): a phone that is neither a Polish number nor E.164, with a field error on `phone`.
  { code: 'phone_invalid', status: 422, messageKey: 'people.errors.phone_invalid' },
  { code: 'role_scope_required', status: 422, messageKey: 'people.errors.role_scope_required' },
  { code: 'role_scope_unexpected', status: 422, messageKey: 'people.errors.role_scope_unexpected' },
  // #126: a facility attendant's place that is not a live place of the club (field error on `placeId`).
  { code: 'role_place_invalid', status: 422, messageKey: 'people.errors.role_place_invalid' },
  // Navigation spec REQ-N12, V-N05 (#262): a section coordinator is an adult (field error on `personId`).
  { code: 'role_requires_adult', status: 422, messageKey: 'people.errors.role_requires_adult' },
  { code: 'guardianship_self', status: 422, messageKey: 'people.errors.guardianship_self' },
  {
    code: 'guardianship_primary_payer_conflict',
    status: 409,
    messageKey: 'people.errors.guardianship_primary_payer_conflict',
  },
  { code: 'guardianship_ended', status: 409, messageKey: 'people.errors.guardianship_ended' },
  { code: 'guardianship_duplicate', status: 409, messageKey: 'people.errors.guardianship_duplicate' },
  {
    code: 'guardianship_guardian_is_ward',
    status: 422,
    messageKey: 'people.errors.guardianship_guardian_is_ward',
  },
  {
    code: 'guardianship_ward_is_guardian',
    status: 422,
    messageKey: 'people.errors.guardianship_ward_is_guardian',
  },
  { code: 'role_assignment_duplicate', status: 409, messageKey: 'people.errors.role_assignment_duplicate' },
  { code: 'person_not_linked', status: 404, messageKey: 'people.errors.person_not_linked' },
  { code: 'payments_minor', status: 403, messageKey: 'people.errors.payments_minor' },
  { code: 'external_id_duplicate', status: 409, messageKey: 'people.errors.external_id_duplicate' },
  // Bulk import (#28, club spec REQ-036): a file or mapping the import cannot use, a finished import, a review row
  // without a decision, a decision the row does not allow, a matched person outside the club.
  { code: 'import_mapping_invalid', status: 422, messageKey: 'people.errors.import_mapping_invalid' },
  { code: 'import_already_committed', status: 409, messageKey: 'people.errors.import_already_committed' },
  { code: 'import_cancelled', status: 409, messageKey: 'people.errors.import_cancelled' },
  { code: 'import_review_pending', status: 422, messageKey: 'people.errors.import_review_pending' },
  { code: 'import_decision_invalid', status: 422, messageKey: 'people.errors.import_decision_invalid' },
  { code: 'import_person_not_found', status: 422, messageKey: 'people.errors.import_person_not_found' },
  // The people list's filters (UX parity spec REQ-U01): a membership filter without `groups`, a filter resolving to
  // more ids than the list loads, and a failed `groups.personFilter` call (retryable).
  { code: 'people_filter_age_range', status: 400, messageKey: 'people.errors.people_filter_age_range' },
  { code: 'people_filter_unavailable', status: 400, messageKey: 'people.errors.people_filter_unavailable' },
  { code: 'people_filter_too_broad', status: 422, messageKey: 'people.errors.people_filter_too_broad' },
  { code: 'people_filter_failed', status: 503, messageKey: 'people.errors.people_filter_failed' },
] as const satisfies ErrorCodeTable

export type PeopleErrorCode = (typeof errorCodes)[number]['code']
