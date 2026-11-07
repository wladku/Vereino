import { describe, expect, it } from '@jest/globals'
import {
  coachUnitsCsv,
  countCoachUnits,
  groszToDecimal,
  monthRange,
  ownCoachOf,
  priceCoachRow,
  shiftMonth,
  type CoachContract,
  type ReportSession,
} from '../coach-units'

const session = (id: string, over: Partial<ReportSession> = {}): ReportSession => ({
  id,
  date: '2026-11-03',
  type: 'training',
  isAway: false,
  leaderPersonId: 'marek',
  ownPersonId: 'marek',
  ...over,
})

describe('the report month', () => {
  it('spans the first to the last day of a YYYY-MM month', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthRange('2026-13')).toBeNull()
    expect(monthRange('2026-1')).toBeNull()
  })

  it('moves by whole months across years and leaves an invalid month as it is', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('nope', 1)).toBe('nope')
  })

  it('takes the own coach from the first substitution entry, else the current coach', () => {
    expect(ownCoachOf('bartek', { previousCoachPersonId: 'marek' })).toBe('marek')
    expect(ownCoachOf('bartek', { previousCoachPersonId: null })).toBeNull()
    expect(ownCoachOf('marek', undefined)).toBe('marek')
  })
})

describe('counting units (DD-14, R04, AC-008)', () => {
  it('credits a substitution to the substitute and balances both rows against a manual count', () => {
    const rows = countCoachUnits([
      session('s1'),
      session('s2', { date: '2026-11-05', leaderPersonId: 'bartek' }),
      session('s3', { date: '2026-11-04', leaderPersonId: 'bartek', ownPersonId: 'bartek' }),
    ])
    const marek = rows.find((row) => row.personId === 'marek')
    const bartek = rows.find((row) => row.personId === 'bartek')
    expect(marek).toMatchObject({ planned: 2, handedOver: 1, takenOver: 0, balance: 1 })
    expect(bartek).toMatchObject({ planned: 1, handedOver: 0, takenOver: 1, balance: 2 })
    expect(marek?.sessions.map((entry) => [entry.id, entry.role])).toEqual([
      ['s1', 'unit'],
      ['s2', 'handed_over'],
    ])
    expect(bartek?.sessions.map((entry) => [entry.id, entry.role])).toEqual([
      ['s3', 'unit'],
      ['s2', 'taken_over'],
    ])
  })

  it('counts matches and away trips for whoever led them, and a session that had no coach as taken over', () => {
    const rows = countCoachUnits([
      session('m1', { type: 'match', isAway: true }),
      session('m2', { type: 'sparring' }),
      session('t1', { type: 'tournament', isAway: true }),
      session('o1', { type: 'other' }),
      session('n1', { ownPersonId: null, leaderPersonId: 'bartek' }),
      session('away', { isAway: true, leaderPersonId: 'bartek' }),
      session('x', { type: 'match', leaderPersonId: null }),
      session('y', { leaderPersonId: null, ownPersonId: null }),
    ])
    const marek = rows.find((row) => row.personId === 'marek')
    const bartek = rows.find((row) => row.personId === 'bartek')
    expect(marek).toMatchObject({ planned: 1, handedOver: 1, matches: 2, trips: 2, balance: 0 })
    expect(marek?.sessions.map((entry) => entry.role)).toEqual(['handed_over', 'match', 'match', 'trip'])
    expect(bartek).toMatchObject({ planned: 0, takenOver: 2, balance: 2, trips: 1 })
  })
})

describe('pricing a row (R14)', () => {
  const units: CoachContract = {
    id: 'c1',
    validFrom: '2026-01-01',
    validTo: null,
    terms: { baseMonthly: 150000, unitRate: 8000, matchRate: 10000, travelRate: 5000 },
  }

  it('prices units_per_contract: base + units × rate + matches × rate + trips × rate', () => {
    const [row] = countCoachUnits([
      session('a'),
      session('b'),
      session('m', { type: 'match', isAway: true }),
      session('h', { leaderPersonId: 'bartek' }),
    ]).filter((found) => found.personId === 'marek')
    // base 1500 + 2 units × 80 + 1 match × 100 + 1 trip × 50 = 1810 zł
    expect(priceCoachRow(row, [units], 'units_per_contract')).toEqual({ amount: 181000, contractState: 'ok' })
  })

  it('prices fixed_base_adjusted: base − handed over + taken over + trips', () => {
    const fixed: CoachContract = { ...units, terms: { baseMonthly: 150000, sessionAmount: 6000, tripAmount: 4000 } }
    const rows = countCoachUnits([
      session('h', { leaderPersonId: 'bartek', isAway: true }),
      session('t', { ownPersonId: 'bartek', isAway: true }),
      session('o'),
    ])
    const marek = rows.find((row) => row.personId === 'marek')
    // base 1500 − 1 × 60 + 1 × 60 + 1 trip × 40 (the handed-over away session was Bartek's trip) = 1540 zł
    expect(marek && priceCoachRow(marek, [fixed], 'fixed_base_adjusted')).toEqual({
      amount: 154000,
      contractState: 'ok',
    })
  })

  it('prices each session by the contract of its day and takes the base from the latest contract', () => {
    const october = { ...units, id: 'old', validTo: '2026-11-15', terms: { ...units.terms, unitRate: 7000 } }
    const later = { ...units, id: 'new', validFrom: '2026-11-16', terms: { ...units.terms, baseMonthly: 160000 } }
    const [row] = countCoachUnits([session('a', { date: '2026-11-10' }), session('b', { date: '2026-11-20' })])
    expect(priceCoachRow(row, [october, later], 'units_per_contract')).toEqual({
      amount: 160000 + 7000 + 8000,
      contractState: 'ok',
    })
  })

  it('leaves the amount empty without a contract, without a base, off a contract day or with a missing rate', () => {
    const [row] = countCoachUnits([session('a'), session('o', { type: 'other' })])
    expect(priceCoachRow(row, [], 'units_per_contract')).toEqual({ amount: null, contractState: 'no_contract' })
    expect(priceCoachRow(row, [{ ...units, terms: { unitRate: 1 } }], 'units_per_contract')).toEqual({
      amount: null,
      contractState: 'incomplete',
    })
    expect(priceCoachRow(row, [{ ...units, validFrom: '2026-11-10' }], 'units_per_contract')).toEqual({
      amount: null,
      contractState: 'incomplete',
    })
    expect(priceCoachRow(row, [{ ...units, terms: { baseMonthly: 1 } }], 'units_per_contract')).toEqual({
      amount: null,
      contractState: 'incomplete',
    })
  })
})

describe('the CSV export', () => {
  it('writes grosz as a decimal amount', () => {
    expect(groszToDecimal(199000)).toBe('1990.00')
    expect(groszToDecimal(5)).toBe('0.05')
    expect(groszToDecimal(-6050)).toBe('-60.50')
  })

  it('has the AC columns, the amount only on request, quoted and formula-safe names', () => {
    const row = { planned: 2, handedOver: 1, takenOver: 0, balance: 1, matches: 0, trips: 1 }
    expect(
      coachUnitsCsv(
        [
          { ...row, coach: 'Kowalski, Jan', amount: 181000 },
          { ...row, coach: '=cmd "x"', amount: null },
        ],
        true,
      ),
    ).toBe(
      'coach,planned,given,taken,balance,matches,trips,amount\r\n' +
        '"Kowalski, Jan",2,1,0,1,0,1,1810.00\r\n' +
        `"'=cmd ""x""",2,1,0,1,0,1,\r\n`,
    )
    expect(coachUnitsCsv([{ ...row, coach: 'Marek', amount: 5 }], false)).toBe(
      'coach,planned,given,taken,balance,matches,trips\r\nMarek,2,1,0,1,0,1\r\n',
    )
  })
})
