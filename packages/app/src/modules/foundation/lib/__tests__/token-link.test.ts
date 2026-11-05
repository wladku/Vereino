// TEST-F07 (unit part; foundation spec P-10): the raw-token shape, the expiry of a new link, the constant-time hash
// comparison and the state of a stored link under both use policies.
import { describe, expect, it } from '@jest/globals'
import { expiryFor, hashesMatch, isWellFormedToken, tokenLinkState } from '../token-link'

const NOW = new Date('2026-11-05T10:00:00.000Z')
const LATER = new Date('2026-11-05T11:00:00.000Z')
const EARLIER = new Date('2026-11-05T09:00:00.000Z')

describe('isWellFormedToken', () => {
  it('accepts the 64 lower-case hex characters of generateAuthToken', () => {
    expect(isWellFormedToken('a'.repeat(32) + '0123456789abcdef'.repeat(2))).toBe(true)
  })

  it('refuses anything else without reading the database', () => {
    expect(isWellFormedToken('A'.repeat(64))).toBe(false)
    expect(isWellFormedToken('a'.repeat(63))).toBe(false)
    expect(isWellFormedToken('a'.repeat(65))).toBe(false)
    expect(isWellFormedToken(`${'a'.repeat(63)}g`)).toBe(false)
    expect(isWellFormedToken('')).toBe(false)
    expect(isWellFormedToken(undefined)).toBe(false)
    expect(isWellFormedToken(42)).toBe(false)
  })
})

describe('expiryFor', () => {
  it('adds the time to live to now', () => {
    expect(expiryFor(NOW, 3_600_000)).toEqual(LATER)
  })

  it('refuses a time to live that is not a positive whole number of milliseconds', () => {
    expect(() => expiryFor(NOW, 0)).toThrow(RangeError)
    expect(() => expiryFor(NOW, -1)).toThrow(RangeError)
    expect(() => expiryFor(NOW, 1.5)).toThrow(RangeError)
    expect(() => expiryFor(NOW, Number.NaN)).toThrow(RangeError)
  })
})

describe('hashesMatch', () => {
  it('is true for equal digests and false for different ones or different lengths', () => {
    expect(hashesMatch('ab'.repeat(32), 'ab'.repeat(32))).toBe(true)
    expect(hashesMatch('ab'.repeat(32), 'ac'.repeat(32))).toBe(false)
    expect(hashesMatch('ab'.repeat(32), 'ab'.repeat(31))).toBe(false)
  })
})

describe('tokenLinkState', () => {
  it('reads a single-use link: active until used or expired; used wins over expired', () => {
    expect(tokenLinkState({ expiresAt: LATER, usedAt: null }, 'single', NOW)).toBe('active')
    expect(tokenLinkState({ expiresAt: LATER }, 'single', NOW)).toBe('active')
    expect(tokenLinkState({ expiresAt: LATER, usedAt: EARLIER }, 'single', NOW)).toBe('used')
    expect(tokenLinkState({ expiresAt: EARLIER, usedAt: EARLIER }, 'single', NOW)).toBe('used')
    expect(tokenLinkState({ expiresAt: EARLIER, usedAt: null }, 'single', NOW)).toBe('expired')
  })

  it('reads an until-expiry link: active strictly before its expiry, whatever it was used for', () => {
    expect(tokenLinkState({ expiresAt: LATER }, 'until_expiry', NOW)).toBe('active')
    expect(tokenLinkState({ expiresAt: NOW }, 'until_expiry', NOW)).toBe('expired')
    expect(tokenLinkState({ expiresAt: EARLIER }, 'until_expiry', NOW)).toBe('expired')
  })
})
