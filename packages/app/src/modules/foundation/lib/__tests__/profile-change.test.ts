import { describe, expect, it } from '@jest/globals'
import { planProfileChange } from '../profile-change'

const STORED = 'anna@example.com'
// What the user typed into the password fields (no real secrets).
const TYPED = { current: 'typed current', fresh: 'typed new', other: 'typed other' }

describe('planProfileChange (ENG-Q-12, #737)', () => {
  it('changes nothing when the e-mail stays and no password is typed', () => {
    expect(planProfileChange(STORED, { email: ' Anna@Example.com ' })).toEqual({
      email: null,
      password: null,
      currentPassword: '',
      issues: [],
    })
  })

  it('needs the current password for a new e-mail', () => {
    expect(planProfileChange(STORED, { email: 'new@example.com' }).issues).toEqual([
      { path: 'currentPassword', messageKey: 'auth.profile.form.errors.currentPasswordRequired' },
    ])
    expect(planProfileChange(STORED, { email: 'new@example.com', currentPassword: TYPED.current })).toEqual({
      email: 'new@example.com',
      password: null,
      currentPassword: TYPED.current,
      issues: [],
    })
  })

  it('needs the current, the new and the confirmed password for a password change', () => {
    expect(planProfileChange(STORED, { email: STORED, password: TYPED.fresh }).issues).toEqual([
      { path: 'currentPassword', messageKey: 'auth.profile.form.errors.currentPasswordRequired' },
      { path: 'confirmPassword', messageKey: 'auth.profile.form.errors.confirmPasswordRequired' },
    ])
    expect(
      planProfileChange(STORED, { email: STORED, currentPassword: TYPED.current, confirmPassword: TYPED.fresh }).issues,
    ).toEqual([{ path: 'password', messageKey: 'auth.profile.form.errors.newPasswordRequired' }])
    const mismatch = { currentPassword: TYPED.current, password: TYPED.fresh, confirmPassword: TYPED.other }
    expect(planProfileChange(STORED, { email: STORED, ...mismatch }).issues).toEqual([
      { path: 'confirmPassword', messageKey: 'auth.profile.form.errors.passwordMismatch' },
    ])
    const both = { currentPassword: TYPED.current, password: TYPED.fresh, confirmPassword: TYPED.fresh }
    expect(planProfileChange(STORED, { email: 'new@example.com', ...both })).toEqual({
      email: 'new@example.com',
      password: TYPED.fresh,
      currentPassword: TYPED.current,
      issues: [],
    })
  })

  it('requires an e-mail', () => {
    expect(planProfileChange(STORED, {}).issues).toEqual([
      { path: 'email', messageKey: 'auth.profile.form.errors.emailRequired' },
    ])
  })
})
