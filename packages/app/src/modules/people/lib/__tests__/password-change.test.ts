import { describe, expect, it } from '@jest/globals'
import {
  PASSWORD_ERROR_KEYS,
  hasPasswordChangedMarker,
  passwordChangeAnswerProblem,
  passwordFormProblems,
  withoutPasswordChangedMarker,
} from '../password-change'

const SHORT = 'short'
const LONGER = `${SHORT}er`
const longEnough = (password: string) => password.length >= 12

describe('passwordFormProblems', () => {
  it('finds nothing in a complete form whose repeat matches', () => {
    const values = {
      currentPassword: 'old one',
      password: 'blue harbour lantern',
      confirmPassword: 'blue harbour lantern',
    }
    expect(passwordFormProblems(values, longEnough)).toEqual([])
  })

  it('lists a missing current and new password in the order of the fields', () => {
    expect(passwordFormProblems({ currentPassword: '', password: '', confirmPassword: '' }, longEnough)).toEqual([
      { field: 'currentPassword', messageKey: PASSWORD_ERROR_KEYS.currentRequired, message: null },
      { field: 'password', messageKey: PASSWORD_ERROR_KEYS.newRequired, message: null },
    ])
  })

  it('refuses a new password below the policy and a repeat that differs', () => {
    expect(
      passwordFormProblems({ currentPassword: 'x', password: SHORT, confirmPassword: LONGER }, longEnough),
    ).toEqual([
      { field: 'password', messageKey: PASSWORD_ERROR_KEYS.policy, message: null },
      { field: 'confirmPassword', messageKey: PASSWORD_ERROR_KEYS.mismatch, message: null },
    ])
  })
})

describe('passwordChangeAnswerProblem', () => {
  it('reads a wrong current password', () => {
    const answer = { error: 'Current password is incorrect.', issues: [{ path: ['currentPassword'], message: 'x' }] }
    expect(passwordChangeAnswerProblem(400, answer)).toEqual({
      field: 'currentPassword',
      messageKey: PASSWORD_ERROR_KEYS.currentInvalid,
      message: null,
    })
  })

  it('reads a password below the platform policy', () => {
    const answer = { error: 'Invalid profile update.', issues: [{ path: ['password'] }, 'odd', { path: 'flat' }] }
    expect(passwordChangeAnswerProblem(400, answer)).toEqual({
      field: 'password',
      messageKey: PASSWORD_ERROR_KEYS.policy,
      message: null,
    })
  })

  it('reads each code of the Vereino password check from the catalog', () => {
    for (const code of [
      'password_whitespace',
      'password_too_long',
      'password_policy',
      'password_too_common',
      'password_context_word',
    ]) {
      expect(passwordChangeAnswerProblem(422, { code, error: 'Server text.' })).toEqual({
        field: 'password',
        messageKey: `foundation.errors.${code}`,
        message: null,
      })
    }
  })

  it('shows the server text of an unknown password-check code, or the policy message without one', () => {
    expect(passwordChangeAnswerProblem(422, { code: 'password_new_rule', error: 'New rule.' })).toEqual({
      field: 'password',
      messageKey: PASSWORD_ERROR_KEYS.policy,
      message: 'New rule.',
    })
    expect(passwordChangeAnswerProblem(422, { code: 'password_new_rule', error: ' ' })).toEqual({
      field: 'password',
      messageKey: PASSWORD_ERROR_KEYS.policy,
      message: null,
    })
  })

  it('treats anything else as a failed save', () => {
    const failed = { field: null, messageKey: PASSWORD_ERROR_KEYS.save, message: null }
    expect(passwordChangeAnswerProblem(400, { issues: [{ path: ['email'] }] })).toEqual(failed)
    expect(passwordChangeAnswerProblem(400, { issues: 'none' })).toEqual(failed)
    expect(passwordChangeAnswerProblem(422, { code: 'other' })).toEqual(failed)
    expect(passwordChangeAnswerProblem(422, { code: 7 })).toEqual(failed)
    expect(passwordChangeAnswerProblem(500, null)).toEqual(failed)
  })
})

describe('password changed marker', () => {
  it('is read from the search string', () => {
    expect(hasPasswordChangedMarker('?password=changed')).toBe(true)
    expect(hasPasswordChangedMarker('?password=other')).toBe(false)
    expect(hasPasswordChangedMarker('')).toBe(false)
  })

  it('is dropped and keeps the other parameters', () => {
    expect(withoutPasswordChangedMarker('?password=changed')).toBe('')
    expect(withoutPasswordChangedMarker('?a=1&password=changed')).toBe('?a=1')
  })
})
