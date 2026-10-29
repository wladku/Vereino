// Error codes owned by the foundation (foundation spec *API, Command, and Error Contracts*; S6.7). Thrown through
// `api/errors.ts`. The optimistic-lock conflict (409 `optimistic_lock_conflict`) is the platform's reserved code:
// `enforceCommandOptimisticLockWithGuards` throws it, so it is not redeclared here (`contracts:check` rejects a
// redeclaration). The token-link codes arrive with phase C; `account_age_below_threshold` and `account_exists`
// belong to `people`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'scope_denied', status: 403, messageKey: 'foundation.errors.scope_denied' },
  { code: 'validity_inverted', status: 422, messageKey: 'foundation.errors.validity_inverted' },
  { code: 'email_taken', status: 409, messageKey: 'foundation.errors.email_taken' },
  { code: 'locale_unsupported', status: 422, messageKey: 'foundation.errors.locale_unsupported' },
] as const satisfies ErrorCodeTable

export type FoundationErrorCode = (typeof errorCodes)[number]['code']
