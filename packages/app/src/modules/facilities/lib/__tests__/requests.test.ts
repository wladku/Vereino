import { describe, expect, it } from '@jest/globals'
import {
  REQUEST_EMAIL_RATE_LIMIT,
  REQUEST_HOLD_HOURS,
  REQUEST_VERIFICATION_TTL_MS,
  approvalAmount,
  blockingHolds,
  comparableName,
  entryBanNameMatch,
  formatAmount,
  formatInstant,
  formatSlot,
  holdActive,
  holdExpiry,
  requestEmailLimit,
} from '../requests'

const at = (iso: string) => new Date(iso)

describe('request timing', () => {
  it('gives the link one hour and the hold 48 hours', () => {
    expect(REQUEST_VERIFICATION_TTL_MS).toBe(3_600_000)
    expect(REQUEST_HOLD_HOURS).toBe(48)
    expect(holdExpiry(at('2026-11-10T10:00:00Z'))).toEqual(at('2026-11-12T10:00:00Z'))
  })

  it('holds only a pending_approval request before its hold ends', () => {
    const now = at('2026-11-10T10:00:00Z')
    expect(holdActive({ status: 'pending_approval', holdExpiresAt: at('2026-11-10T10:00:01Z') }, now)).toBe(true)
    expect(holdActive({ status: 'pending_approval', holdExpiresAt: now }, now)).toBe(false)
    expect(holdActive({ status: 'pending_approval', holdExpiresAt: null }, now)).toBe(false)
    expect(holdActive({ status: 'pending_verification', holdExpiresAt: at('2026-11-11T00:00:00Z') }, now)).toBe(false)
  })
})

describe('blockingHolds', () => {
  const now = at('2026-11-10T10:00:00Z')
  const hold = at('2026-11-11T10:00:00Z')
  const request = (id: string, start: string, end: string, overrides = {}) => ({
    id,
    status: 'pending_approval' as const,
    holdExpiresAt: hold,
    start: at(start),
    end: at(end),
    ...overrides,
  })

  it('returns the other valid holds that overlap the window', () => {
    const window = { start: at('2026-11-12T18:00:00Z'), end: at('2026-11-12T19:30:00Z') }
    const requests = [
      request('overlap', '2026-11-12T19:00:00Z', '2026-11-12T20:30:00Z'),
      request('adjacent', '2026-11-12T19:30:00Z', '2026-11-12T21:00:00Z'),
      request('lapsed', '2026-11-12T18:00:00Z', '2026-11-12T19:30:00Z', { holdExpiresAt: now }),
      request('self', '2026-11-12T18:00:00Z', '2026-11-12T19:30:00Z'),
    ]
    expect(blockingHolds(requests, window, now, 'self').map((item) => item.id)).toEqual(['overlap'])
    expect(blockingHolds(requests, window, now).map((item) => item.id)).toEqual(['overlap', 'self'])
  })
})

describe('requestEmailLimit', () => {
  it('keys the limit by the normalized address alone and fails closed', () => {
    const limit = requestEmailLimit('  Guest@Example.org ')
    expect(limit.key).toBe(requestEmailLimit('guest@example.org').key)
    expect(limit.key).toMatch(/^[0-9a-f]{64}$/)
    expect(limit.key).not.toContain('guest')
    expect(limit.config).toBe(REQUEST_EMAIL_RATE_LIMIT)
    expect(REQUEST_EMAIL_RATE_LIMIT).toEqual({ points: 5, duration: 3600, keyPrefix: 'facilities_request_email' })
    expect(limit.options).toEqual({ failClosed: true })
  })
})

describe('entry-ban name hint', () => {
  it('compares names without case, diacritics or punctuation', () => {
    expect(comparableName('  KS Sąsiedzi—Łódź! ')).toBe('ks sasiedzi łodz')
  })

  it('matches a requester name against the banned names', () => {
    expect(entryBanNameMatch(['K.S. Sąsiedzi', 'Jan Nowak'], ['ks sasiedzi'])).toBe(true)
    expect(entryBanNameMatch(['Other club'], ['KS Sąsiedzi', '  '])).toBe(false)
    expect(entryBanNameMatch(['!!'], ['?'])).toBe(false)
  })
})

describe('approvalAmount', () => {
  it('keeps the quoted amount without an override', () => {
    expect(approvalAmount(12000, null, null)).toEqual({ amount: 12000, noteMissing: false })
    expect(approvalAmount(null, null, null)).toEqual({ amount: null, noteMissing: false })
  })

  it('needs a note for a changed amount', () => {
    expect(approvalAmount(12000, 10000, null)).toEqual({ amount: 10000, noteMissing: true })
    expect(approvalAmount(12000, 10000, '  ')).toEqual({ amount: 10000, noteMissing: true })
    expect(approvalAmount(12000, 10000, 'Agreed discount')).toEqual({ amount: 10000, noteMissing: false })
    expect(approvalAmount(12000, 12000, null)).toEqual({ amount: 12000, noteMissing: false })
    expect(approvalAmount(null, 5000, null)).toEqual({ amount: 5000, noteMissing: true })
  })
})

describe('e-mail formatting', () => {
  it('formats the amount, the slot and an instant in the club zone', () => {
    expect(formatAmount(12000, 'PLN', 'en')).toMatch(/^PLN\s120\.00$/)
    const start = at('2026-11-12T18:30:00Z')
    const end = at('2026-11-12T20:00:00Z')
    expect(formatSlot(start, end, 'Europe/Warsaw', 'en-GB')).toBe('12/11/2026, 19:30–21:00')
    expect(formatInstant(end, 'Europe/Warsaw', 'en-GB')).toBe('12/11/2026, 21:00')
  })
})
