import { describe, expect, it } from '@jest/globals'
import { COMMON_PASSWORD_COUNT, COMMON_PASSWORDS } from '../common-passwords'
import {
  CONTEXT_REMAINDER_MIN,
  PASSWORD_MAX_BYTES,
  PASSWORD_MAX_CHARACTERS,
  PASSWORD_REFUSALS,
  PRODUCT_CONTEXT_WORDS,
  checkPassword,
  contextWords,
  isBuiltFromContextWords,
  normalizeForWords,
  utf8Length,
} from '../password-check'

// The production policy (12 characters, no classes) and the platform default (6, a digit, upper case, special).
const productionPolicy = (password: string) => password.length >= 12
const platformDefault = (password: string) =>
  password.length >= 6 && /[0-9]/.test(password) && /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password)
const common = new Set(['password1234', 'qwertyuiop12'])
const input = {
  meetsPolicy: productionPolicy,
  isCommon: (value: string) => common.has(value),
  contextWords: contextWords([
    ...PRODUCT_CONTEXT_WORDS,
    'Klub Sportowy Orzeł',
    'orzel-krakow',
    'jan.kowalski@example.com',
  ]),
}

describe('normalizeForWords', () => {
  it('lower-cases, drops accents and folds the letters without a combining mark', () => {
    expect(normalizeForWords('Orzeł-Kraków 1923')).toBe('orzelkrakow1923')
    expect(normalizeForWords('Øresund Đak Straße')).toBe('oresunddakstrasse')
    expect(normalizeForWords('Zażółć gęślą jaźń!')).toBe('zazolcgeslajazn')
  })
})

describe('contextWords', () => {
  it('keeps each value whole and its pieces of at least four letters, once, and skips empty values', () => {
    expect(contextWords(['Klub Sportowy Orzeł', null, undefined, '', 'jan.kowalski@example.com', 'klub'])).toEqual([
      'klubsportowyorzel',
      'klub',
      'sportowy',
      'orzel',
      'jankowalskiexamplecom',
      'kowalski',
      'example',
    ])
  })
})

describe('isBuiltFromContextWords', () => {
  it('refuses a password that keeps too few characters once its context words are gone', () => {
    expect(isBuiltFromContextWords('Vereino2026!!', input.contextWords)).toBe(true)
    expect(isBuiltFromContextWords('KlubSportowyOrzeł 1923', input.contextWords)).toBe(true)
  })

  it('accepts a long passphrase that happens to contain a context word', () => {
    expect(isBuiltFromContextWords('Vereino-lmw2x9ab3kq-Aa1!', input.contextWords)).toBe(false)
  })

  it('never refuses a password that contains no context word, however short', () => {
    expect(isBuiltFromContextWords('abc', input.contextWords)).toBe(false)
  })

  it('removes the longer word first, so a club name is not split into its pieces', () => {
    expect(isBuiltFromContextWords('klubsportowyorzelX', ['klub', 'klubsportowyorzel'])).toBe(true)
    expect(CONTEXT_REMAINDER_MIN).toBe(8)
  })
})

describe('utf8Length', () => {
  it('counts bytes, not characters', () => {
    expect(utf8Length('abc')).toBe(3)
    expect(utf8Length('żółw')).toBe(7)
  })
})

describe('checkPassword', () => {
  it('accepts a lower-case passphrase under the production policy', () => {
    expect(checkPassword('correct horse battery staple', input)).toBeNull()
  })

  it('refuses leading or trailing whitespace first', () => {
    expect(checkPassword(' correct horse battery staple', input)).toBe('password_whitespace')
    expect(checkPassword('correct horse battery staple\t', input)).toBe('password_whitespace')
  })

  it('refuses more than 64 characters or more than 72 bytes', () => {
    expect(PASSWORD_MAX_CHARACTERS).toBe(64)
    expect(PASSWORD_MAX_BYTES).toBe(72)
    expect(checkPassword('a'.repeat(64) + 'b', input)).toBe('password_too_long')
    expect(checkPassword('ż'.repeat(37), input)).toBe('password_too_long')
    expect(checkPassword('ż'.repeat(36), input)).toBeNull()
  })

  it('applies the platform policy check it is given', () => {
    expect(checkPassword('short pass', input)).toBe('password_policy')
    expect(checkPassword('correct horse battery staple', { ...input, meetsPolicy: platformDefault })).toBe(
      'password_policy',
    )
  })

  it('refuses a password on the common list in any letter case', () => {
    expect(checkPassword('Password1234', input)).toBe('password_too_common')
  })

  it('refuses a password built from context words', () => {
    expect(checkPassword('Jan.Kowalski2026', input)).toBe('password_context_word')
  })

  it('names every refusal it can answer', () => {
    expect(PASSWORD_REFUSALS).toEqual([
      'password_whitespace',
      'password_too_long',
      'password_policy',
      'password_too_common',
      'password_context_word',
    ])
  })
})

describe('the common-password list', () => {
  it('holds the lower-cased, de-duplicated NCSC top 100k, most used first', () => {
    const entries = COMMON_PASSWORDS.split('\n')
    expect(entries).toHaveLength(COMMON_PASSWORD_COUNT)
    expect(COMMON_PASSWORD_COUNT).toBeGreaterThan(97_000)
    expect(new Set(entries).size).toBe(entries.length)
    expect(entries.slice(0, 2)).toEqual(['123456', '123456789'])
    // Kept byte for byte: a `$$` entry survives (a string `replace` once turned it into `$`), no address is left.
    expect(entries).toContain('money$$')
    expect(entries.some((entry) => /@[a-z0-9-]+\.[a-z]/.test(entry))).toBe(false)
    expect(entries.every((entry) => entry.length > 0 && entry === entry.toLowerCase())).toBe(true)
  })
})
