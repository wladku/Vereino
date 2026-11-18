import { describe, expect, it } from '@jest/globals'
import {
  RENTAL_LINK_PURPOSES,
  RENTAL_LINK_TTL_MS,
  cancelledOutcome,
  cancelsFree,
  rentalCancelPath,
  rentalCancellable,
  rentalCancelledKey,
  rentalLinkExpiry,
  rentalMovedKey,
  rentalSummaryKey,
} from '../rental-links'
import { UNPAID_EXPIRY_REASON } from '../rentals'

const now = new Date('2026-11-18T10:00:00Z')

describe('rental links', () => {
  it('has the cancel purpose only', () => {
    expect(RENTAL_LINK_PURPOSES).toEqual(['cancel'])
  })

  it('expires at the start of a future rental within the TTL', () => {
    const start = new Date('2026-11-20T17:00:00Z')
    expect(rentalLinkExpiry(start, now)).toBe(start)
    const edge = new Date(now.getTime() + RENTAL_LINK_TTL_MS)
    expect(rentalLinkExpiry(edge, now)).toBe(edge)
  })

  it('issues no link for a started rental or one beyond the TTL', () => {
    expect(rentalLinkExpiry(now, now)).toBeNull()
    expect(rentalLinkExpiry(new Date('2026-11-17T10:00:00Z'), now)).toBeNull()
    expect(rentalLinkExpiry(new Date(now.getTime() + RENTAL_LINK_TTL_MS + 1), now)).toBeNull()
  })

  it('cancels only a rental that holds its slot', () => {
    expect(rentalCancellable('requested')).toBe(true)
    expect(rentalCancellable('confirmed')).toBe(true)
    expect(rentalCancellable('cancelled_free')).toBe(false)
    expect(rentalCancellable('done')).toBe(false)
    expect(rentalCancellable('pending_approval')).toBe(false)
  })

  it('is free up to the stored deadline, else 24 h before the start', () => {
    const start = new Date('2026-11-20T10:00:00Z')
    expect(cancelsFree(start, new Date('2026-11-18T10:00:00Z'), now)).toBe(true)
    expect(cancelsFree(start, new Date('2026-11-18T09:59:59Z'), now)).toBe(false)
    expect(cancelsFree(new Date('2026-11-19T10:00:00Z'), null, now)).toBe(true)
    expect(cancelsFree(new Date('2026-11-19T09:59:59Z'), null, now)).toBe(false)
  })

  it('states the outcome of a cancellation', () => {
    expect(cancelledOutcome('cancelled_late', null)).toBe('late')
    expect(cancelledOutcome('cancelled_free', null)).toBe('free')
    expect(cancelledOutcome('cancelled_free', 'changed plans')).toBe('free')
    expect(cancelledOutcome('cancelled_free', UNPAID_EXPIRY_REASON)).toBe('unpaid')
    expect(cancelledOutcome('confirmed', null)).toBeNull()
  })

  it('builds the dispatch keys and the page path', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(rentalSummaryKey(id)).toBe(`facilities:rental:${id}:summary`)
    expect(rentalMovedKey(id)).toBe(`facilities:rental-moved:${id}`)
    expect(rentalCancelledKey(id, 'cancelled_late')).toBe(`facilities:rental:${id}:cancelled_late`)
    expect(rentalCancelPath('klub ą', 'a/b')).toBe('/p/klub%20%C4%85/rentals/cancel/a%2Fb')
  })
})
