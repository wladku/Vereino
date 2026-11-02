import { describe, expect, it } from '@jest/globals'
import type { Recipient } from '@vereino/core'
import {
  DELIVERY_STATUSES,
  EMAIL_SENDS_PER_SECOND,
  FAILURE_CODES,
  IN_APP_BATCH_SIZE,
  LEASE_SECONDS,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_BACKOFF_MINUTES,
  SKIP_REASONS,
  attemptOutcome,
  chunk,
  createSendRateLimiter,
  failureCodeFor,
  planDeliveries,
  primaryReason,
} from '../dispatch-rules'

const recipient = (personId: string, overrides: Partial<Recipient> = {}): Recipient => ({
  personId,
  userId: null,
  email: null,
  locale: 'pl',
  reasons: ['participant'],
  channels: [],
  ...overrides,
})

describe('dispatch constants', () => {
  it('fixes the statuses, reasons, codes and limits of the spec', () => {
    expect(DELIVERY_STATUSES).toEqual(['queued', 'sent', 'failed', 'skipped'])
    expect(SKIP_REASONS).toEqual(['unreachable', 'opted_out', 'delivery_disabled'])
    expect(FAILURE_CODES).toEqual(['transport_unavailable', 'provider_rejected', 'address_invalid', 'render_failed'])
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5)
    expect(RETRY_BACKOFF_MINUTES).toEqual([1, 5, 15, 60])
    expect(LEASE_SECONDS).toBe(120)
    expect(EMAIL_SENDS_PER_SECOND).toBe(8)
    expect(IN_APP_BATCH_SIZE).toBe(1000)
  })
})

describe('planDeliveries', () => {
  it('writes one row per recipient and channel, the secret on the e-mail row only, and a skipped row when unreachable', () => {
    const rows = planDeliveries(
      [
        recipient('a', {
          userId: 'ua',
          email: 'a@example.test',
          channels: ['in_app', 'email'],
          reasons: ['coach', 'guardian'],
        }),
        recipient('b', { email: 'b@example.test', channels: ['email'], locale: 'en' }),
        recipient('c', { userId: 'uc', channels: ['in_app'] }),
        recipient('d', { reasons: ['guardian'] }),
      ],
      new Map([
        ['a', { token: 'secret-a' }],
        ['c', { token: 'dropped' }],
        ['d', { token: 'dropped' }],
      ]),
    )
    expect(rows).toEqual([
      {
        personId: 'a',
        locale: 'pl',
        reasons: ['coach', 'guardian'],
        userId: 'ua',
        channel: 'in_app',
        email: null,
        status: 'queued',
        skipReason: null,
        secret: null,
      },
      {
        personId: 'a',
        locale: 'pl',
        reasons: ['coach', 'guardian'],
        userId: null,
        channel: 'email',
        email: 'a@example.test',
        status: 'queued',
        skipReason: null,
        secret: { token: 'secret-a' },
      },
      {
        personId: 'b',
        locale: 'en',
        reasons: ['participant'],
        userId: null,
        channel: 'email',
        email: 'b@example.test',
        status: 'queued',
        skipReason: null,
        secret: null,
      },
      {
        personId: 'c',
        locale: 'pl',
        reasons: ['participant'],
        userId: 'uc',
        channel: 'in_app',
        email: null,
        status: 'queued',
        skipReason: null,
        secret: null,
      },
      {
        personId: 'd',
        locale: 'pl',
        reasons: ['guardian'],
        userId: null,
        channel: 'email',
        email: null,
        status: 'skipped',
        skipReason: 'unreachable',
        secret: null,
      },
    ])
  })

  it('takes no secrets by default', () => {
    expect(planDeliveries([recipient('b', { email: 'b@example.test', channels: ['email'] })])[0]?.secret).toBeNull()
  })
})

describe('failureCodeFor and attemptOutcome', () => {
  it('codes a failure without storing its text', () => {
    expect(failureCodeFor({ transient: true, message: 'ETIMEDOUT' })).toBe('transport_unavailable')
    expect(failureCodeFor({ transient: false, message: 'EMAIL_TRANSPORT_NOT_CONFIGURED: enable a provider' })).toBe(
      'transport_unavailable',
    )
    expect(failureCodeFor({ transient: false, message: 'EMAIL_FROM_NOT_CONFIGURED' })).toBe('transport_unavailable')
    expect(failureCodeFor({ transient: false, status: 422, message: 'Invalid `to` address' })).toBe('address_invalid')
    expect(failureCodeFor({ transient: false, message: 'The recipient e-mail is invalid' })).toBe('address_invalid')
    expect(failureCodeFor({ transient: false, status: 403, message: 'Domain not verified' })).toBe('provider_rejected')
  })

  it('retries a transient failure with backoff until the fifth attempt and fails a permanent one at once', () => {
    const transient = { transient: true, message: 'socket hang up' }
    expect(attemptOutcome(0, transient)).toEqual({ kind: 'retry', delayMs: 60_000 })
    expect(attemptOutcome(1, transient)).toEqual({ kind: 'retry', delayMs: 60_000 })
    expect(attemptOutcome(2, transient)).toEqual({ kind: 'retry', delayMs: 5 * 60_000 })
    expect(attemptOutcome(3, transient)).toEqual({ kind: 'retry', delayMs: 15 * 60_000 })
    expect(attemptOutcome(4, transient)).toEqual({ kind: 'retry', delayMs: 60 * 60_000 })
    expect(attemptOutcome(5, transient)).toEqual({ kind: 'fail', failureCode: 'transport_unavailable' })
    expect(attemptOutcome(1, { transient: false, message: 'Domain not verified' })).toEqual({
      kind: 'fail',
      failureCode: 'provider_rejected',
    })
  })
})

describe('primaryReason and chunk', () => {
  it('names the guardian first and falls back to direct', () => {
    expect(primaryReason(['coach', 'guardian'])).toBe('guardian')
    expect(primaryReason(['coach', 'participant'])).toBe('participant')
    expect(primaryReason(['coach'])).toBe('coach')
    expect(primaryReason([])).toBe('direct')
  })

  it('splits a list into batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe('createSendRateLimiter', () => {
  it('lets at most max acquisitions into any window, reserving slots for concurrent callers', async () => {
    let clock = 0
    const waits: number[] = []
    const limiter = createSendRateLimiter({
      max: 2,
      windowMs: 1000,
      now: () => clock,
      sleep: (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    })
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire(), limiter.acquire(), limiter.acquire()])
    expect(waits).toEqual([1001, 1001, 2002])
    // Later, the old slots have left the window.
    clock = 5000
    await limiter.acquire()
    expect(waits).toEqual([1001, 1001, 2002])
  })

  it('defaults to the wall clock and a real timer', async () => {
    const limiter = createSendRateLimiter({ max: 1, windowMs: 5 })
    const started = Date.now()
    await limiter.acquire()
    await limiter.acquire()
    expect(Date.now() - started).toBeGreaterThanOrEqual(5)
  })
})
