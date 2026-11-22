import { describe, expect, it } from '@jest/globals'
import {
  ERASURE_REQUEST_REASON,
  RETENTION_SWEEP_REASON,
  emptyRetentionSweepCounts,
  latestEnd,
  monthsBefore,
  retentionKeepReasons,
  type RetentionFacts,
} from '../retention-rules'

const TODAY = '2026-11-22'
const CUTOFF_12 = '2025-11-22'

function facts(overrides: Partial<RetentionFacts> = {}): RetentionFacts {
  return {
    leftOn: '2025-10-22',
    anonymizedAt: null,
    hasAccount: false,
    rolesUntil: null,
    guardianshipsUntil: null,
    recordsAfterCutoff: 0,
    contributorNotices: [],
    ...overrides,
  }
}

describe('retention sweep rule (REQ-041, #471)', () => {
  it('names the two anonymisation reasons', () => {
    expect(RETENTION_SWEEP_REASON).toBe('retention_sweep')
    expect(ERASURE_REQUEST_REASON).toBe('erasure_request')
  })

  it('counts months back, clamping to the last day of a shorter month', () => {
    expect(monthsBefore(TODAY, 12)).toBe(CUTOFF_12)
    expect(monthsBefore(TODAY, 24)).toBe('2024-11-22')
    expect(monthsBefore('2026-01-15', 1)).toBe('2025-12-15')
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28')
    expect(monthsBefore('2028-03-31', 1)).toBe('2028-02-29')
    expect(monthsBefore('2026-05-31', 120)).toBe('2016-05-31')
    expect(() => monthsBefore('2026-13-01', 1)).toThrow()
  })

  it('takes the latest end of the periods, an open one first', () => {
    expect(latestEnd([])).toBeNull()
    expect(latestEnd([{ validTo: '2025-01-01' }, { validTo: '2025-06-30' }, { validTo: '2025-03-01' }])).toBe(
      '2025-06-30',
    )
    expect(latestEnd([{ validTo: '2025-01-01' }, { validTo: null }, { validTo: '2025-06-30' }])).toBe('open')
    expect(latestEnd([{}])).toBe('open')
  })

  it('anonymises a person who left 13 months ago with nothing reaching past the cutoff', () => {
    expect(retentionKeepReasons(facts(), CUTOFF_12)).toEqual([])
    expect(retentionKeepReasons(facts({ leftOn: CUTOFF_12 }), CUTOFF_12)).toEqual([])
    expect(
      retentionKeepReasons(
        facts({
          rolesUntil: CUTOFF_12,
          guardianshipsUntil: '2025-01-01',
          contributorNotices: [{ module: 'payments', code: 'other_notice' }],
        }),
        CUTOFF_12,
      ),
    ).toEqual([])
  })

  it('keeps a person the club set a longer period for (24 months at 13)', () => {
    expect(retentionKeepReasons(facts(), monthsBefore(TODAY, 24))).toEqual(['left_within_period'])
  })

  it('keeps an anonymised person without other reasons', () => {
    expect(retentionKeepReasons(facts({ anonymizedAt: new Date(), leftOn: null }), CUTOFF_12)).toEqual([
      'already_anonymized',
    ])
  })

  it('keeps for every reason, in a stable order', () => {
    expect(
      retentionKeepReasons(
        facts({
          leftOn: null,
          hasAccount: true,
          rolesUntil: 'open',
          guardianshipsUntil: '2026-01-01',
          recordsAfterCutoff: 2,
          contributorNotices: [
            { module: 'payments', code: 'open_charges', params: { count: 2 } },
            { module: 'payments', code: 'open_charges' },
            { module: 'payments', code: 'cash_held' },
          ],
        }),
        CUTOFF_12,
      ),
    ).toEqual([
      'not_left',
      'account_open',
      'role_within_period',
      'guardianship_within_period',
      'records_within_period',
      'open_charges',
      'cash_held',
    ])
    expect(retentionKeepReasons(facts({ guardianshipsUntil: 'open' }), CUTOFF_12)).toEqual([
      'guardianship_within_period',
    ])
  })

  it('starts the counts at zero', () => {
    expect(emptyRetentionSweepCounts()).toEqual({ candidates: 0, anonymized: 0, kept: 0, failed: 0 })
  })
})
