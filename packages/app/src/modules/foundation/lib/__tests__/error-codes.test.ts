import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'

describe('foundation error codes', () => {
  it('declares the phase A1 codes, the locale code of #27, the foundation II codes, the S5.2 lock-token code, the foundation III codes, the unlinked-account code of #76 the token-link codes of phase C, the social sign-in codes of #566, the Enterprise gate codes of #649 and the per-club import code of #633, the password check codes of #779 and the e-mail confirmation codes of #737 with their statuses and message keys', () => {
    expect(errorCodes).toEqual([
      { code: 'scope_denied', status: 403, messageKey: 'foundation.errors.scope_denied' },
      { code: 'validity_inverted', status: 422, messageKey: 'foundation.errors.validity_inverted' },
      { code: 'email_taken', status: 409, messageKey: 'foundation.errors.email_taken' },
      { code: 'locale_unsupported', status: 422, messageKey: 'foundation.errors.locale_unsupported' },
      { code: 'recurrence_unsupported', status: 422, messageKey: 'foundation.errors.recurrence_unsupported' },
      { code: 'recurrence_invalid', status: 422, messageKey: 'foundation.errors.recurrence_invalid' },
      { code: 'invalid_transition', status: 409, messageKey: 'foundation.errors.invalid_transition' },
      { code: 'append_only', status: 409, messageKey: 'foundation.errors.append_only' },
      { code: 'lock_token_required', status: 400, messageKey: 'foundation.errors.lock_token_required' },
      { code: 'audience_kind_unavailable', status: 422, messageKey: 'foundation.errors.audience_kind_unavailable' },
      { code: 'audience_too_large', status: 422, messageKey: 'foundation.errors.audience_too_large' },
      { code: 'dispatch_params_invalid', status: 422, messageKey: 'foundation.errors.dispatch_params_invalid' },
      { code: 'scope_unlinked', status: 403, messageKey: 'foundation.errors.scope_unlinked' },
      { code: 'token_link_expired', status: 410, messageKey: 'foundation.errors.token_link_expired' },
      { code: 'token_link_used', status: 410, messageKey: 'foundation.errors.token_link_used' },
      { code: 'identity_provider_disabled', status: 404, messageKey: 'foundation.errors.identity_provider_disabled' },
      { code: 'identity_unavailable', status: 503, messageKey: 'foundation.errors.identity_unavailable' },
      { code: 'identity_already_linked', status: 409, messageKey: 'foundation.errors.identity_already_linked' },
      { code: 'identity_last_method', status: 409, messageKey: 'foundation.errors.identity_last_method' },
      { code: 'enterprise_feature_disabled', status: 404, messageKey: 'foundation.errors.enterprise_feature_disabled' },
      {
        code: 'enterprise_feature_read_only',
        status: 409,
        messageKey: 'foundation.errors.enterprise_feature_read_only',
      },
      { code: 'import_running', status: 409, messageKey: 'foundation.errors.import_running' },
      { code: 'password_whitespace', status: 422, messageKey: 'foundation.errors.password_whitespace' },
      { code: 'password_too_long', status: 422, messageKey: 'foundation.errors.password_too_long' },
      { code: 'password_policy', status: 422, messageKey: 'foundation.errors.password_policy' },
      { code: 'password_too_common', status: 422, messageKey: 'foundation.errors.password_too_common' },
      { code: 'password_context_word', status: 422, messageKey: 'foundation.errors.password_context_word' },
      // Staff second factor (#736).
      { code: 'second_factor_use_google', status: 403, messageKey: 'foundation.errors.second_factor_use_google' },
      { code: 'second_factor_unavailable', status: 503, messageKey: 'foundation.errors.second_factor_unavailable' },
      {
        code: 'second_factor_challenges_limited',
        status: 429,
        messageKey: 'foundation.errors.second_factor_challenges_limited',
      },
      { code: 'second_factor_code_invalid', status: 400, messageKey: 'foundation.errors.second_factor_code_invalid' },
      {
        code: 'second_factor_challenge_expired',
        status: 401,
        messageKey: 'foundation.errors.second_factor_challenge_expired',
      },
      {
        code: 'second_factor_resend_limited',
        status: 429,
        messageKey: 'foundation.errors.second_factor_resend_limited',
      },
      { code: 'second_factor_reset_self', status: 403, messageKey: 'foundation.errors.second_factor_reset_self' },
      {
        code: 'email_change_confirmation_required',
        status: 403,
        messageKey: 'foundation.errors.email_change_confirmation_required',
      },
      { code: 'current_password_invalid', status: 400, messageKey: 'foundation.errors.current_password_invalid' },
    ])
  })

  it('does not redeclare the platform optimistic-lock code', () => {
    expect(errorCodes.map((entry) => entry.code)).not.toContain('optimistic_lock_conflict')
  })
})
