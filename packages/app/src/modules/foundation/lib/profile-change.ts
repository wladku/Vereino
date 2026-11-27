// What a submit of the profile form changes (ENG-Q-12, #737): the Vereino replacement of the platform's profile page
// sends a new login e-mail to `PUT /api/foundation/profile/email` with the current password, and a new password to the
// platform's `PUT /api/auth/profile`. Both need the current password.
import { normalizeLoginEmail } from '@vereino/core'

export type ProfileFormValues = {
  email?: string
  currentPassword?: string
  password?: string
  confirmPassword?: string
}

export type ProfileFormIssue = {
  path: 'email' | 'currentPassword' | 'password' | 'confirmPassword'
  /** The platform `auth` catalog key of the message. */
  messageKey:
    | 'auth.profile.form.errors.emailRequired'
    | 'auth.profile.form.errors.currentPasswordRequired'
    | 'auth.profile.form.errors.newPasswordRequired'
    | 'auth.profile.form.errors.confirmPasswordRequired'
    | 'auth.profile.form.errors.passwordMismatch'
}

export type ProfileChangePlan = {
  /** The new login e-mail, or null when it stays. */
  email: string | null
  /** The new password, or null when it stays. */
  password: string | null
  currentPassword: string
  issues: ProfileFormIssue[]
}

/** The changes of one submit and the form issues that stop it (empty when it may be sent). */
export function planProfileChange(storedEmail: string, values: ProfileFormValues): ProfileChangePlan {
  const email = values.email?.trim() ?? ''
  const currentPassword = values.currentPassword?.trim() ?? ''
  const password = values.password?.trim() ?? ''
  const confirmPassword = values.confirmPassword?.trim() ?? ''
  const issues: ProfileFormIssue[] = []
  if (!email) issues.push({ path: 'email', messageKey: 'auth.profile.form.errors.emailRequired' })
  const emailChanged = email !== '' && normalizeLoginEmail(email) !== normalizeLoginEmail(storedEmail)
  const passwordIntent = password !== '' || confirmPassword !== ''
  if ((emailChanged || passwordIntent) && !currentPassword) {
    issues.push({ path: 'currentPassword', messageKey: 'auth.profile.form.errors.currentPasswordRequired' })
  }
  if (passwordIntent && !password) {
    issues.push({ path: 'password', messageKey: 'auth.profile.form.errors.newPasswordRequired' })
  }
  if (passwordIntent && !confirmPassword) {
    issues.push({ path: 'confirmPassword', messageKey: 'auth.profile.form.errors.confirmPasswordRequired' })
  }
  if (password && confirmPassword && password !== confirmPassword) {
    issues.push({ path: 'confirmPassword', messageKey: 'auth.profile.form.errors.passwordMismatch' })
  }
  return {
    email: emailChanged ? email : null,
    password: passwordIntent && password ? password : null,
    currentPassword,
    issues,
  }
}
