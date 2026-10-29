import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'

describe('foundation error codes', () => {
  it('declares the phase A1 and foundation II codes with their statuses and message keys', () => {
    expect(errorCodes).toEqual([
      { code: 'scope_denied', status: 403, messageKey: 'foundation.errors.scope_denied' },
      { code: 'validity_inverted', status: 422, messageKey: 'foundation.errors.validity_inverted' },
      { code: 'email_taken', status: 409, messageKey: 'foundation.errors.email_taken' },
      { code: 'recurrence_unsupported', status: 422, messageKey: 'foundation.errors.recurrence_unsupported' },
      { code: 'recurrence_invalid', status: 422, messageKey: 'foundation.errors.recurrence_invalid' },
      { code: 'invalid_transition', status: 409, messageKey: 'foundation.errors.invalid_transition' },
    ])
  })

  it('does not redeclare the platform optimistic-lock code', () => {
    expect(errorCodes.map((entry) => entry.code)).not.toContain('optimistic_lock_conflict')
  })
})
