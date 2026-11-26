import { describe, expect, it } from '@jest/globals'
import { planProfileChange } from '../profile-change'

const STORED = 'anna@example.com'

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
    expect(planProfileChange(STORED, { email: 'new@example.com', currentPassword: 'secret' })).toEqual({
      email: 'new@example.com',
      password: null,
      currentPassword: 'secret',
      issues: [],
    })
  })

  it('needs the current, the new and the confirmed password for a password change', () => {
    expect(planProfileChange(STORED, { email: STORED, password: 'n3w-Password!' }).issues).toEqual([
      { path: 'currentPassword', messageKey: 'auth.profile.form.errors.currentPasswordRequired' },
      { path: 'confirmPassword', messageKey: 'auth.profile.form.errors.confirmPasswordRequired' },
    ])
    expect(planProfileChange(STORED, { email: STORED, currentPassword: 'old', confirmPassword: 'x' }).issues).toEqual([
      { path: 'password', messageKey: 'auth.profile.form.errors.newPasswordRequired' },
    ])
    expect(
      planProfileChange(STORED, { email: STORED, currentPassword: 'old', password: 'a', confirmPassword: 'b' }).issues,
    ).toEqual([{ path: 'confirmPassword', messageKey: 'auth.profile.form.errors.passwordMismatch' }])
    expect(
      planProfileChange(STORED, { email: 'new@example.com', currentPassword: 'old', password: 'a', confirmPassword: 'a' }),
    ).toEqual({ email: 'new@example.com', password: 'a', currentPassword: 'old', issues: [] })
  })

  it('requires an e-mail', () => {
    expect(planProfileChange(STORED, {}).issues).toEqual([
      { path: 'email', messageKey: 'auth.profile.form.errors.emailRequired' },
    ])
  })
})
