// The Vereino password check (#779, spec .ai/specs/implemented/2026-11-26-vereino-password-check.md): the rules a new password
// must pass on top of the platform policy (`OM_PASSWORD_*`). Pure: the common-password lookup and the context words
// come from the caller (`services/password-check.ts`), and so does the platform policy check (S4.9: no platform import).

/** At most 64 characters (ASVS V6.2.9 asks for at least 64 to be allowed) … */
export const PASSWORD_MAX_CHARACTERS = 64
/** … and at most 72 UTF-8 bytes: bcrypt ignores every byte beyond 72 (V6.2.8, PW-D04). */
export const PASSWORD_MAX_BYTES = 72
/** A password built from context words keeps fewer than this many letters and digits once they are removed (Q4). */
export const CONTEXT_REMAINDER_MIN = 8
/** Shorter pieces of a name or address are not context words ("com", "jan"). */
export const CONTEXT_WORD_MIN = 4
/** The product words every check bans (V6.1.2). */
export const PRODUCT_CONTEXT_WORDS = ['vereino', 'openmercato', 'mercato'] as const

export const PASSWORD_REFUSALS = [
  'password_whitespace',
  'password_too_long',
  'password_policy',
  'password_too_common',
  'password_context_word',
] as const
export type PasswordRefusal = (typeof PASSWORD_REFUSALS)[number]

export type PasswordCheckInput = {
  /** True when the password meets the platform policy (`OM_PASSWORD_*`: minimum length, character classes). */
  meetsPolicy: (password: string) => boolean
  /** True when the lower-cased password is on the common/breached list. */
  isCommon: (lowerCased: string) => boolean
  /** Normalized context words (`contextWords`). */
  contextWords: readonly string[]
}

/** Lower case, accents dropped, letters and digits only: `Orzeł-Kraków 1923` → `orzelkrakow1923`. */
export function normalizeForWords(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      // Letters the decomposition keeps whole (no combining mark to drop).
      .replace(/ł/g, 'l')
      .replace(/ø/g, 'o')
      .replace(/đ/g, 'd')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]/g, '')
  )
}

/**
 * The context words of names, slugs and addresses: each value whole and each of its pieces split on anything that is
 * not a letter or digit, normalized, at least `CONTEXT_WORD_MIN` long, without repeats.
 */
export function contextWords(values: ReadonlyArray<string | null | undefined>): string[] {
  const words = new Set<string>()
  for (const value of values) {
    if (!value) continue
    const pieces = [value, ...value.split(/[^\p{L}\p{N}]+/u)]
    for (const piece of pieces) {
      const word = normalizeForWords(piece)
      if (word.length >= CONTEXT_WORD_MIN) words.add(word)
    }
  }
  return [...words]
}

/** True when the password, without every context word in it, keeps fewer than `CONTEXT_REMAINDER_MIN` characters. */
export function isBuiltFromContextWords(password: string, words: readonly string[]): boolean {
  let rest = normalizeForWords(password)
  let removed = false
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    if (!rest.includes(word)) continue
    rest = rest.split(word).join('')
    removed = true
  }
  return removed && rest.length < CONTEXT_REMAINDER_MIN
}

export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}

/** The first rule a new password breaks, or `null` when it passes. */
export function checkPassword(password: string, input: PasswordCheckInput): PasswordRefusal | null {
  if (password !== password.trim()) return 'password_whitespace'
  if (Array.from(password).length > PASSWORD_MAX_CHARACTERS || utf8Length(password) > PASSWORD_MAX_BYTES) {
    return 'password_too_long'
  }
  if (!input.meetsPolicy(password)) return 'password_policy'
  if (input.isCommon(password.toLowerCase())) return 'password_too_common'
  if (isBuiltFromContextWords(password, input.contextWords)) return 'password_context_word'
  return null
}
