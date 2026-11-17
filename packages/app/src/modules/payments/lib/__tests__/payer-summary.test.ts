import { describe, expect, it } from '@jest/globals'
import {
  PAYER_CODE_ALPHABET,
  generatePayerCode,
  isPayerCode,
  otherPayersOf,
  overdueSummary,
  ownPaymentsSummary,
  type OwnCharge,
} from '../payer-summary'

const ME = 'me'
const WARD = 'ward'
const GUARDIAN = 'guardian'

const charge = (extra: Partial<OwnCharge> = {}): OwnCharge => ({
  status: 'open',
  dueDate: '2026-11-10',
  remaining: 34900,
  payerPersonId: ME,
  personId: WARD,
  ...extra,
})

describe('payer code', () => {
  it('draws four characters from the alphabet after GW-', () => {
    expect(generatePayerCode(() => 0)).toBe('GW-2222')
    // A random source returning its upper bound still stays inside the alphabet.
    expect(generatePayerCode(() => 1)).toBe('GW-ZZZZ')
    const sequence = [0.1, 0.5, 0.75, 0.99]
    let index = 0
    const code = generatePayerCode(() => sequence[index++] ?? 0)
    expect(code).toHaveLength(7)
    expect(isPayerCode(code)).toBe(true)
  })

  it('recognises only well-formed codes', () => {
    expect(isPayerCode('GW-K7Q2')).toBe(true)
    expect(isPayerCode('gw-k7q2')).toBe(false)
    expect(isPayerCode('GW-K7Q')).toBe(false)
    expect(isPayerCode('GW-K0Q2')).toBe(false)
    expect(isPayerCode('XX-K7Q2')).toBe(false)
    expect(PAYER_CODE_ALPHABET).not.toMatch(/[01IO]/)
  })
})

describe('ownPaymentsSummary', () => {
  it('sums what remains on open charges and names the nearest due date', () => {
    const summary = ownPaymentsSummary(
      ME,
      [
        charge({ dueDate: '2026-12-10', remaining: 20000 }),
        charge({ dueDate: '2026-11-10', remaining: 14900, status: 'partially_paid' }),
        charge({ dueDate: '2027-01-10', remaining: 0 }),
        charge({ status: 'paid', remaining: 0, dueDate: '2026-10-10' }),
      ],
      '2026-11-08',
    )
    expect(summary).toEqual({
      state: 'due',
      openTotal: 34900,
      openCount: 2,
      nearestDueDate: '2026-11-10',
      overdue: false,
    })
  })

  it('marks the summary overdue when the nearest due date has passed', () => {
    expect(
      ownPaymentsSummary(ME, [charge({ dueDate: '2026-11-01' }), charge({ dueDate: '2026-11-20' })], '2026-11-08'),
    ).toMatchObject({
      state: 'due',
      overdue: true,
    })
  })

  it('reports everything paid when the payer has nothing open', () => {
    expect(ownPaymentsSummary(ME, [charge({ status: 'paid', remaining: 0 })], '2026-11-08')).toEqual({
      state: 'paid',
    })
    expect(ownPaymentsSummary(ME, [charge({ remaining: 0 })], '2026-11-08')).toEqual({ state: 'paid' })
    expect(ownPaymentsSummary(ME, [], '2026-11-08')).toEqual({ state: 'paid' })
  })

  it('says the guardian pays when someone else pays the caller’s own charges', () => {
    expect(ownPaymentsSummary(ME, [charge({ payerPersonId: GUARDIAN, personId: ME })], '2026-11-08')).toEqual({
      state: 'guardian_pays',
    })
  })

  it('ignores charges without a payer', () => {
    expect(ownPaymentsSummary(ME, [charge({ payerPersonId: null, personId: ME })], '2026-11-08')).toEqual({
      state: 'paid',
    })
    expect(ownPaymentsSummary(ME, [charge({ payerPersonId: GUARDIAN, personId: WARD })], '2026-11-08')).toEqual({
      state: 'paid',
    })
  })

  it('says who pays instead of "Everything is paid" when another guardian pays a ward (DD-C06)', () => {
    const others = [{ wardFirstName: 'Jaś', payerFirstName: 'Kasia' }]
    expect(ownPaymentsSummary(ME, [], '2026-11-08', others)).toEqual({
      state: 'other_pays',
      payerFirstName: 'Kasia',
      otherPayers: others,
    })
    expect(ownPaymentsSummary(ME, [charge({ status: 'paid', remaining: 0 })], '2026-11-08', others)).toMatchObject({
      state: 'other_pays',
    })
  })

  it('keeps what is due and the guardian-pays state ahead of another payer', () => {
    const others = [{ wardFirstName: 'Jaś', payerFirstName: 'Kasia' }]
    expect(ownPaymentsSummary(ME, [charge()], '2026-11-08', others)).toMatchObject({ state: 'due' })
    expect(ownPaymentsSummary(ME, [charge({ payerPersonId: GUARDIAN, personId: ME })], '2026-11-08', others)).toEqual({
      state: 'guardian_pays',
    })
  })
})

describe('otherPayersOf (DD-C06)', () => {
  const names = new Map([
    ['jas', 'Jaś'],
    ['ala', 'Ala'],
    ['kasia', 'Kasia'],
    ['me', 'Basia'],
  ])

  it('lists the wards another person pays, by the ward’s first name, first names only', () => {
    const payers = new Map([
      ['jas', 'kasia'],
      ['ala', 'kasia'],
      ['own', ME],
    ])
    const owing = new Set(['jas', 'ala', 'own', 'none'])
    expect(otherPayersOf(ME, ['jas', 'ala', 'own', 'none', 'jas'], payers, owing, names)).toEqual([
      { wardFirstName: 'Ala', payerFirstName: 'Kasia' },
      { wardFirstName: 'Jaś', payerFirstName: 'Kasia' },
    ])
  })

  it('leaves out a ward with nothing open to pay', () => {
    expect(
      otherPayersOf(
        ME,
        ['jas', 'ala'],
        new Map([
          ['jas', 'kasia'],
          ['ala', 'kasia'],
        ]),
        new Set(['ala']),
        names,
      ),
    ).toEqual([{ wardFirstName: 'Ala', payerFirstName: 'Kasia' }])
  })

  it('falls back to an empty name when a person is not found', () => {
    expect(otherPayersOf(ME, ['x'], new Map([['x', 'y']]), new Set(['x']), names)).toEqual([
      { wardFirstName: '', payerFirstName: '' },
    ])
  })
})

describe('overdueSummary', () => {
  it('counts families by payer and sums what remains', () => {
    expect(
      overdueSummary([
        { payerPersonId: 'a', remaining: 10000 },
        { payerPersonId: 'a', remaining: 5000 },
        { payerPersonId: 'b', remaining: 20000 },
        { payerPersonId: null, remaining: 1000 },
      ]),
    ).toEqual({ total: 36000, charges: 4, families: 2 })
    expect(overdueSummary([])).toEqual({ total: 0, charges: 0, families: 0 })
  })
})
