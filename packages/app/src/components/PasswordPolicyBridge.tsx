'use client'
// Hands the server's password policy to the platform's browser forms (#779, spec 2026-11-26-vereino-password-check,
// PW-D03, REQ-PW02). The change-password, profile, reset and user create/edit pages call the platform's
// `getPasswordPolicy()` in the browser, which reads `process.env` by a computed key that the bundler never fills, so the
// forms fell back to the platform default (6 characters, a digit, an upper-case letter, a special character) whatever
// `OM_PASSWORD_*` says. The root layout reads the policy on the server; this component writes it into the browser's
// `process.env` while it renders, before the page below it reads it. TEST-PW02 fails if a bundler change breaks it.
import type { PasswordPolicy } from '@open-mercato/shared/lib/auth/passwordPolicy'

const POLICY_VARIABLES = {
  minLength: 'OM_PASSWORD_MIN_LENGTH',
  requireDigit: 'OM_PASSWORD_REQUIRE_DIGIT',
  requireUppercase: 'OM_PASSWORD_REQUIRE_UPPERCASE',
  requireSpecial: 'OM_PASSWORD_REQUIRE_SPECIAL',
} as const satisfies Record<keyof PasswordPolicy, string>

export function PasswordPolicyBridge({ policy }: { policy: PasswordPolicy }): null {
  if (typeof window !== 'undefined') {
    const env = process.env as Record<string, string | undefined>
    for (const [field, variable] of Object.entries(POLICY_VARIABLES)) {
      env[variable] = String(policy[field as keyof PasswordPolicy])
    }
  }
  return null
}
