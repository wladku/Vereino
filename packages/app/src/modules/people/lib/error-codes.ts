// Error codes owned by `people` (engineering standards S6.7; club spec *API, Command, and Error Contracts*; foundation
// spec P-07). Thrown through `api/errors.ts`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'account_age_below_threshold', status: 422, messageKey: 'people.errors.account_age_below_threshold' },
  { code: 'account_birth_date_required', status: 422, messageKey: 'people.errors.account_birth_date_required' },
  { code: 'account_exists', status: 409, messageKey: 'people.errors.account_exists' },
  { code: 'pesel_duplicate', status: 409, messageKey: 'people.errors.pesel_duplicate' },
  { code: 'pesel_invalid', status: 422, messageKey: 'people.errors.pesel_invalid' },
  { code: 'role_scope_required', status: 422, messageKey: 'people.errors.role_scope_required' },
  { code: 'role_scope_unexpected', status: 422, messageKey: 'people.errors.role_scope_unexpected' },
  { code: 'guardianship_self', status: 422, messageKey: 'people.errors.guardianship_self' },
  {
    code: 'guardianship_primary_payer_conflict',
    status: 409,
    messageKey: 'people.errors.guardianship_primary_payer_conflict',
  },
  { code: 'guardianship_ended', status: 409, messageKey: 'people.errors.guardianship_ended' },
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
] as const satisfies ErrorCodeTable

export type PeopleErrorCode = (typeof errorCodes)[number]['code']
