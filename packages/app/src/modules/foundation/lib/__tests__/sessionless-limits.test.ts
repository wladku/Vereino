// Unit tests of the sessionless rate-limit layers (engineering standards S8.6; #738): keys never hold an address or a
// token in clear, addresses are counted per club, the test opt-in needs all three signals.
import { createHash } from 'node:crypto'
import { describe, expect, it } from '@jest/globals'
import {
  PASSWORD_RESET_EMAIL_LIMIT,
  SIGN_IN_EMAIL_LIMIT,
  accountEmailLimit,
  emailFromBody,
  emailFromUrlEncoded,
  forwardedEntryCount,
  hashKeyPart,
  linkRequestEmailLimit,
  normalizeEmail,
  rateLimitStoreWatched,
  retryAfterSeconds,
  testLimiterRequested,
  tokenLimit,
} from '../sessionless-limits'

const sha = (value: string) => createHash('sha256').update(value).digest('hex')

describe('sessionless limit keys', () => {
  it('hashes key parts and normalizes addresses', () => {
    expect(hashKeyPart('abc')).toBe(sha('abc'))
    expect(normalizeEmail('  Ann@Example.ORG ')).toBe('ann@example.org')
  })

  it('counts a token per token, with the read and write windows', () => {
    expect(tokenLimit('p_read', 'tok', 'read')).toEqual({
      config: { points: 60, duration: 60, keyPrefix: 'p_read' },
      key: sha('tok'),
    })
    expect(tokenLimit('p_write', 'tok', 'write')).toEqual({
      config: { points: 30, duration: 60, keyPrefix: 'p_write' },
      key: sha('tok'),
    })
  })

  it('counts a link request per address within one club, never the address in clear', () => {
    const limit = linkRequestEmailLimit('p_email', ' Club-A ', 'Ann@Example.org')
    expect(limit.config).toEqual({ points: 3, duration: 3600, keyPrefix: 'p_email' })
    expect(limit.key).toBe(`club-a:${sha('ann@example.org')}`)
    expect(limit.key).not.toContain('ann')
    expect(linkRequestEmailLimit('p_email', 'club-b', 'ann@example.org').key).not.toBe(limit.key)
  })

  it('counts sign-in and reset per account from any client', () => {
    expect(accountEmailLimit(SIGN_IN_EMAIL_LIMIT, ' Ann@Example.org')).toEqual({
      config: { points: 10, duration: 900, keyPrefix: 'vereino_sign_in_email' },
      key: sha('ann@example.org'),
    })
    expect(accountEmailLimit(PASSWORD_RESET_EMAIL_LIMIT, 'ann@example.org').config).toEqual({
      points: 3,
      duration: 3600,
      keyPrefix: 'vereino_password_reset_email',
    })
  })
})

describe('emailFromBody', () => {
  it('reads a non-blank e-mail string', () => {
    expect(emailFromBody({ email: 'ann@example.org' })).toBe('ann@example.org')
  })

  it('answers null for anything else', () => {
    expect(emailFromBody(null)).toBeNull()
    expect(emailFromBody('ann@example.org')).toBeNull()
    expect(emailFromBody({})).toBeNull()
    expect(emailFromBody({ email: '  ' })).toBeNull()
    expect(emailFromBody({ email: 42 })).toBeNull()
  })
})

describe('emailFromUrlEncoded', () => {
  it('reads the first email field, as the platform handlers do', () => {
    expect(emailFromUrlEncoded('email=ann%40example.org&password=x')).toBe('ann@example.org')
    expect(emailFromUrlEncoded('email=victim%40example.org&email=decoy%40example.org')).toBe('victim@example.org')
  })

  it('answers null without a usable email field', () => {
    expect(emailFromUrlEncoded('password=x')).toBeNull()
    expect(emailFromUrlEncoded('email=')).toBeNull()
  })
})

describe('testLimiterRequested', () => {
  const env = { OM_TEST_MODE: '1', OM_TEST_AUTH_RATE_LIMIT_MODE: 'opt-in' }

  it('needs the test mode, the opt-in mode and the header', () => {
    expect(testLimiterRequested(env, 'on')).toBe(true)
    expect(testLimiterRequested(env, null)).toBe(false)
    expect(testLimiterRequested(env, 'off')).toBe(false)
    expect(testLimiterRequested({ ...env, OM_TEST_MODE: undefined }, 'on')).toBe(false)
    expect(testLimiterRequested({ ...env, OM_TEST_AUTH_RATE_LIMIT_MODE: 'always' }, 'on')).toBe(false)
  })
})

describe('retryAfterSeconds', () => {
  it('rounds up to whole seconds, at least 1', () => {
    expect(retryAfterSeconds(1500)).toBe(2)
    expect(retryAfterSeconds(60_000)).toBe(60)
    expect(retryAfterSeconds(1)).toBe(1)
    expect(retryAfterSeconds(0)).toBe(1)
    expect(retryAfterSeconds(-5)).toBe(1)
    expect(retryAfterSeconds(Number.NaN)).toBe(1)
  })
})

describe('forwardedEntryCount', () => {
  it('counts the non-blank X-Forwarded-For entries', () => {
    expect(forwardedEntryCount(null)).toBe(0)
    expect(forwardedEntryCount(undefined)).toBe(0)
    expect(forwardedEntryCount('')).toBe(0)
    expect(forwardedEntryCount('203.0.113.7')).toBe(1)
    expect(forwardedEntryCount('198.51.100.2, 203.0.113.7')).toBe(2)
    expect(forwardedEntryCount('198.51.100.2, ,')).toBe(1)
  })
})

describe('rateLimitStoreWatched', () => {
  const env = { RATE_LIMIT_STRATEGY: 'redis', REDIS_URL: 'redis://redis:6379' }

  it('watches a redis limiter with a URL while limits are on', () => {
    expect(rateLimitStoreWatched(env)).toBe(true)
    expect(rateLimitStoreWatched({ ...env, RATE_LIMIT_ENABLED: 'true' })).toBe(true)
  })

  it('does not watch otherwise', () => {
    expect(rateLimitStoreWatched({ ...env, RATE_LIMIT_ENABLED: ' OFF ' })).toBe(false)
    expect(rateLimitStoreWatched({ ...env, RATE_LIMIT_STRATEGY: 'memory' })).toBe(false)
    expect(rateLimitStoreWatched({ RATE_LIMIT_STRATEGY: 'redis' })).toBe(false)
    expect(rateLimitStoreWatched({ ...env, REDIS_URL: ' ' })).toBe(false)
  })
})
