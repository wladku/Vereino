import { describe, expect, it } from '@jest/globals'
import { openChargesByPerson, retentionHoldUntil } from '../departure'

describe('retentionHoldUntil', () => {
  it('holds until the end of the fifth year after the latest payment, none without a payment', () => {
    expect(retentionHoldUntil('2026-03-14')).toBe('2031-12-31')
    expect(retentionHoldUntil('2026-12-31')).toBe('2031-12-31')
    expect(retentionHoldUntil(null)).toBeNull()
  })
})

describe('openChargesByPerson', () => {
  it('counts each charge once per leaving person as debtor or payer, and leaves out persons without one', () => {
    const counts = openChargesByPerson(
      [
        { id: 'c1', personId: 'child', payerPersonId: 'mother' },
        { id: 'c2', personId: 'mother', payerPersonId: 'mother' },
        { id: 'c3', personId: 'other', payerPersonId: null },
      ],
      ['mother', 'child', 'coach'],
    )
    expect([...counts.entries()]).toEqual([
      ['mother', 2],
      ['child', 1],
    ])
  })
})
