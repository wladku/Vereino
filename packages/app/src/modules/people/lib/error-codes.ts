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
] as const satisfies ErrorCodeTable

export type PeopleErrorCode = (typeof errorCodes)[number]['code']
