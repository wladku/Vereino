import { describe, expect, it } from '@jest/globals'
import { ACCOUNTING_RETENTION_YEARS, openChargesByPerson, retentionHoldUntil } from '../departure'

describe('retentionHoldUntil', () => {
  it('holds until the end of the sixth year after the latest payment, as the accounting records (#526)', () => {
    expect(ACCOUNTING_RETENTION_YEARS).toBe(6)
    expect(retentionHoldUntil('2026-03-14')).toBe('2032-12-31')
    expect(retentionHoldUntil('2026-12-31')).toBe('2032-12-31')
    expect(retentionHoldUntil(null)).toBeNull()
  })

  it('follows a club retention period other than the default', () => {
    expect(retentionHoldUntil('2026-03-14', 8)).toBe('2034-12-31')
    expect(retentionHoldUntil(null, 8)).toBeNull()
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
