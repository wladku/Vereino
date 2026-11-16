// People life-cycle spec *Security → Rate limits* (#303): the re-send limits, the integration opt-in and the wait.
import { describe, expect, it } from '@jest/globals'
import {
  RESEND_PER_ACCOUNT,
  RESEND_PER_ACTOR,
  resendLimits,
  retryAfterMinutes,
  testLimiterRequested,
} from '../account-limits'

describe('resendLimits', () => {
  it('limits the account to 3 in 5 minutes and the administrator to 20 in an hour, keyed by tenant', () => {
    expect(resendLimits({ tenantId: 't', personId: 'p', actorUserId: 'u' })).toEqual([
      { config: { points: 3, duration: 300, keyPrefix: 'people_resend_invitation' }, key: 't:p' },
      { config: { points: 20, duration: 3600, keyPrefix: 'people_resend_invitation_actor' }, key: 't:u' },
    ])
    expect(RESEND_PER_ACCOUNT.points).toBe(3)
    expect(RESEND_PER_ACTOR.points).toBe(20)
  })
})

describe('testLimiterRequested', () => {
  const env = { OM_TEST_MODE: '1', OM_TEST_AUTH_RATE_LIMIT_MODE: 'opt-in' }

  it('is true only for the platform opt-in with the header on', () => {
    expect(testLimiterRequested(env, 'on')).toBe(true)
    expect(testLimiterRequested(env, 'off')).toBe(false)
    expect(testLimiterRequested(env, null)).toBe(false)
    expect(testLimiterRequested({ ...env, OM_TEST_MODE: undefined }, 'on')).toBe(false)
    expect(testLimiterRequested({ ...env, OM_TEST_AUTH_RATE_LIMIT_MODE: 'always' }, 'on')).toBe(false)
  })
})

describe('retryAfterMinutes', () => {
  it('rounds the seconds up to whole minutes, at least one', () => {
    expect(retryAfterMinutes(1)).toBe(1)
    expect(retryAfterMinutes(60)).toBe(1)
    expect(retryAfterMinutes(61)).toBe(2)
    expect(retryAfterMinutes(300)).toBe(5)
    expect(retryAfterMinutes(0)).toBe(1)
    expect(retryAfterMinutes(Number.NaN)).toBe(1)
  })
})
