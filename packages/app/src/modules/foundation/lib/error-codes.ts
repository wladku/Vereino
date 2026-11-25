// Error codes owned by the foundation (foundation spec *API, Command, and Error Contracts*; S6.7). Thrown through
// `api/errors.ts`. The optimistic-lock conflict (409 `optimistic_lock_conflict`) is the platform's reserved code:
// `enforceCommandOptimisticLockWithGuards` throws it, so it is not redeclared here (`contracts:check` rejects a
// redeclaration). `account_age_below_threshold` and `account_exists` belong to `people`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'scope_denied', status: 403, messageKey: 'foundation.errors.scope_denied' },
  { code: 'validity_inverted', status: 422, messageKey: 'foundation.errors.validity_inverted' },
  { code: 'email_taken', status: 409, messageKey: 'foundation.errors.email_taken' },
  { code: 'locale_unsupported', status: 422, messageKey: 'foundation.errors.locale_unsupported' },
  // Foundation II (DD-G14): thrown by `services/recurrence.ts` and `services/transitions.ts`.
  { code: 'recurrence_unsupported', status: 422, messageKey: 'foundation.errors.recurrence_unsupported' },
  { code: 'recurrence_invalid', status: 422, messageKey: 'foundation.errors.recurrence_invalid' },
  { code: 'invalid_transition', status: 409, messageKey: 'foundation.errors.invalid_transition' },
  // Foundation II P-28 (DD-G11): an update or delete of an append-only row (#34).
  { code: 'append_only', status: 409, messageKey: 'foundation.errors.append_only' },
  // S5.2: `authorizeScoped` answers it when an update, delete or action on an existing record carries no lock token
  // (the platform's check skips silently without one, so a client without it would overwrite newer data).
  { code: 'lock_token_required', status: 400, messageKey: 'foundation.errors.lock_token_required' },
  // Foundation III P-29 / P-30 (#71): an audience kind no module provides, an audience over the fan-out cap, and
  // template params that fail the template's schema.
  { code: 'audience_kind_unavailable', status: 422, messageKey: 'foundation.errors.audience_kind_unavailable' },
  { code: 'audience_too_large', status: 422, messageKey: 'foundation.errors.audience_too_large' },
  { code: 'dispatch_params_invalid', status: 422, messageKey: 'foundation.errors.dispatch_params_invalid' },
  // #76: `authorizeScoped` and `assertInScope` answer it instead of `scope_denied` when the session scope holds no
  // grant beyond `self_user` — the account is not linked to a person of this club (`lib/scope-denial.ts`).
  { code: 'scope_unlinked', status: 403, messageKey: 'foundation.errors.scope_unlinked' },
  // Phase C P-10 (#157): `TokenLinkService.peek` and `redeem` refuse an expired link and a spent single-use link.
  { code: 'token_link_expired', status: 410, messageKey: 'foundation.errors.token_link_expired' },
  { code: 'token_link_used', status: 410, messageKey: 'foundation.errors.token_link_used' },
  // Social sign-in (#566, spec *API, Command, and Error Contracts*): a provider without a client id, the state store
  // unreachable on `start` (fail closed), a second link of the same provider for the same user, and removing the last
  // sign-in method. The callback's failures are redirects with fingerprints, not codes.
  { code: 'identity_provider_disabled', status: 404, messageKey: 'foundation.errors.identity_provider_disabled' },
  { code: 'identity_unavailable', status: 503, messageKey: 'foundation.errors.identity_unavailable' },
  { code: 'identity_already_linked', status: 409, messageKey: 'foundation.errors.identity_already_linked' },
  { code: 'identity_last_method', status: 409, messageKey: 'foundation.errors.identity_last_method' },
  // Enterprise package spec DD-E06, DD-E07 (#649): `enterpriseFeatures` answers them for an Enterprise feature no
  // installed licence key enables for the tenant (404, like an unknown route) and for a write while the tenant's key
  // expired past its grace period (409; reads keep working).
  { code: 'enterprise_feature_disabled', status: 404, messageKey: 'foundation.errors.enterprise_feature_disabled' },
  { code: 'enterprise_feature_read_only', status: 409, messageKey: 'foundation.errors.enterprise_feature_read_only' },
] as const satisfies ErrorCodeTable

export type FoundationErrorCode = (typeof errorCodes)[number]['code']
