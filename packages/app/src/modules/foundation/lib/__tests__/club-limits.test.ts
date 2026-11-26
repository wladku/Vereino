import { describe, expect, it } from '@jest/globals'
import {
  CLUB_REQUEST_LIMIT_DEFAULTS,
  clubImportLockKey,
  clubRequestLimitKey,
  readClubRequestLimit,
  routeLimitKey,
} from '../club-limits'

describe('readClubRequestLimit (many-clubs DD-M10, Q-M04; #633)', () => {
  it('defaults to 600 requests per minute per club', () => {
    expect(CLUB_REQUEST_LIMIT_DEFAULTS).toEqual({ points: 600, duration: 60 })
    expect(readClubRequestLimit({})).toEqual({ points: 600, duration: 60, blockDuration: 0, keyPrefix: 'vereino-club' })
  })

  it('reads the points and the window from the environment', () => {
    expect(
      readClubRequestLimit({ VEREINO_CLUB_RATE_LIMIT_POINTS: '1200', VEREINO_CLUB_RATE_LIMIT_DURATION: '30' }),
    ).toMatchObject({ points: 1200, duration: 30 })
  })

  it('switches the budget off with 0 points', () => {
    expect(readClubRequestLimit({ VEREINO_CLUB_RATE_LIMIT_POINTS: '0' })).toBeNull()
  })

  it('falls back to the defaults for blank, malformed, negative or zero values', () => {
    for (const value of ['', '  ', 'abc', '-5', '1.5']) {
      expect(
        readClubRequestLimit({ VEREINO_CLUB_RATE_LIMIT_POINTS: value, VEREINO_CLUB_RATE_LIMIT_DURATION: value }),
      ).toMatchObject({ points: 600, duration: 60 })
    }
    expect(readClubRequestLimit({ VEREINO_CLUB_RATE_LIMIT_DURATION: '0' })).toMatchObject({ duration: 60 })
  })
})

describe('limiter keys', () => {
  it('keys the club budget by tenant', () => {
    expect(clubRequestLimitKey('t-1')).toBe('tenant:t-1')
  })

  it('adds the club slug of a public route to the client key', () => {
    expect(routeLimitKey('1.2.3.4', { clubSlug: 'orlik' })).toBe('1.2.3.4:club:orlik')
  })

  it('keeps the client key on routes without a club slug', () => {
    expect(routeLimitKey('1.2.3.4', {})).toBe('1.2.3.4')
    expect(routeLimitKey('1.2.3.4', { clubSlug: '' })).toBe('1.2.3.4')
    expect(routeLimitKey('global', { clubSlug: ['a', 'b'] })).toBe('global')
  })

  it('names the club import lock by organization', () => {
    expect(clubImportLockKey('o-1')).toBe('vereino.club_import:o-1')
  })
})
