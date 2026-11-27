// The member's own password change on the phone (`/club/profile/password`, #876; README M-10): the checks the form
// makes before it sends anything, and how it reads the answer of the platform's `PUT /api/auth/profile` — a wrong
// current password (400, an issue on `currentPassword`), a password below the policy (400, an issue on `password`) and
// the Vereino password check (422 with a `password_*` code, #779). Pure, so the page and its tests share one reading.

export type PasswordChangeField = 'currentPassword' | 'password' | 'confirmPassword'

export type PasswordChangeValues = Readonly<Record<PasswordChangeField, string>>

/** One problem of the form: its field and the catalog key of its message, or the server's own (translated) text. */
export type PasswordChangeProblem = {
  readonly field: PasswordChangeField | null
  readonly messageKey: string
  /** The server's translated text, shown instead of `messageKey` when present (an unknown password-check code). */
  readonly message: string | null
}

export const PASSWORD_ERROR_KEYS = {
  currentRequired: 'people.club.password.errors.currentRequired',
  currentInvalid: 'people.club.password.errors.currentInvalid',
  newRequired: 'people.club.password.errors.newRequired',
  policy: 'people.club.password.errors.policy',
  mismatch: 'people.club.password.errors.mismatch',
  save: 'people.club.password.errors.save',
} as const

/**
 * The codes of the Vereino password check (`foundation` error codes, #779) and their catalog keys: the page shows them
 * in its own language, whatever locale the server translated its text for.
 */
const PASSWORD_CHECK_KEYS: Readonly<Record<string, string>> = {
  password_whitespace: 'foundation.errors.password_whitespace',
  password_too_long: 'foundation.errors.password_too_long',
  password_policy: 'foundation.errors.password_policy',
  password_too_common: 'foundation.errors.password_too_common',
  password_context_word: 'foundation.errors.password_context_word',
}

function problem(field: PasswordChangeField | null, messageKey: string, message: string | null = null) {
  return { field, messageKey, message }
}

/**
 * The problems of the form before it is sent, in the order of the fields: the current password is missing; the new
 * one is missing or fails the policy (`meetsPolicy`, the platform's `buildPasswordSchema` with the server policy); the
 * repeat differs from the new password. Values are compared exactly as typed: the server refuses a space at either end.
 */
export function passwordFormProblems(
  values: PasswordChangeValues,
  meetsPolicy: (password: string) => boolean,
): PasswordChangeProblem[] {
  const found: PasswordChangeProblem[] = []
  if (values.currentPassword === '') found.push(problem('currentPassword', PASSWORD_ERROR_KEYS.currentRequired))
  if (values.password === '') found.push(problem('password', PASSWORD_ERROR_KEYS.newRequired))
  else if (!meetsPolicy(values.password)) found.push(problem('password', PASSWORD_ERROR_KEYS.policy))
  if (values.password !== '' && values.confirmPassword !== values.password) {
    found.push(problem('confirmPassword', PASSWORD_ERROR_KEYS.mismatch))
  }
  return found
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/** The first path segment of each validation issue of a 400 answer. */
function issueFields(body: Record<string, unknown>): string[] {
  const issues = Array.isArray(body.issues) ? body.issues : []
  return issues.map((issue) => {
    const path = record(issue).path
    return Array.isArray(path) ? String(path[0]) : ''
  })
}

/**
 * The problem a refused `PUT /api/auth/profile` answer stands for: a code of the Vereino check on the new password
 * (its catalog key; an unknown `password_*` code shows the server's text, else the policy message); a 400 with an issue on `currentPassword` (wrong current password) or on `password`
 * (below the policy); anything else is a failed save.
 */
export function passwordChangeAnswerProblem(status: number, answer: unknown): PasswordChangeProblem {
  const body = record(answer)
  const code = typeof body.code === 'string' ? body.code : ''
  const text = typeof body.error === 'string' && body.error.trim() !== '' ? body.error : null
  if (status === 422 && Object.hasOwn(PASSWORD_CHECK_KEYS, code)) return problem('password', PASSWORD_CHECK_KEYS[code])
  if (status === 422 && code.startsWith('password_')) return problem('password', PASSWORD_ERROR_KEYS.policy, text)
  if (status === 400) {
    const fields = issueFields(body)
    if (fields.includes('currentPassword')) return problem('currentPassword', PASSWORD_ERROR_KEYS.currentInvalid)
    if (fields.includes('password')) return problem('password', PASSWORD_ERROR_KEYS.policy)
  }
  return problem(null, PASSWORD_ERROR_KEYS.save)
}

/** The query parameter `/club/profile` reads to say the password was changed (the member returns there after it). */
export const PASSWORD_CHANGED_PARAM = 'password'
export const PASSWORD_CHANGED_VALUE = 'changed'

/** Whether a search string (`?…`) carries the "password changed" marker. */
export function hasPasswordChangedMarker(search: string): boolean {
  return new URLSearchParams(search).get(PASSWORD_CHANGED_PARAM) === PASSWORD_CHANGED_VALUE
}

/** The search string without the marker (`''` when nothing else is left), so a reload does not repeat the message. */
export function withoutPasswordChangedMarker(search: string): string {
  const params = new URLSearchParams(search)
  params.delete(PASSWORD_CHANGED_PARAM)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}
