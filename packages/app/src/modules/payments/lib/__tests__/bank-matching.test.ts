import { describe, expect, it } from '@jest/globals'
import {
  actionAllowed,
  actionsFor,
  afterAllocation,
  allocateTransfer,
  containsWords,
  findPayerCodes,
  importCounts,
  matchTransfer,
  paysWholeCharges,
  perspectiveStatus,
  planImport,
  transferHash,
  type OpenCharge,
  type PayerCandidate,
} from '../bank-matching'

const charge = (id: string, dueDate: string, remaining: number): OpenCharge => ({
  id,
  status: 'open',
  dueDate,
  createdAt: '2026-10-01T10:00:00.000Z',
  remaining,
})

const entry = (amount: number, title = 'x', counterpartyName = 'Anna Lis') => ({
  bookedOn: '2026-11-03',
  amount,
  counterpartyName,
  title,
  counterpartyAccount: 'PL 61 1090',
})

describe('actions', () => {
  it('allows each action only from its statuses', () => {
    expect(actionAllowed('confirm', 'suggested')).toBe(true)
    expect(actionAllowed('confirm', 'unmatched')).toBe(false)
    expect(actionAllowed('undo', 'booked')).toBe(true)
    expect(actionAllowed('restore', 'ignored')).toBe(true)
    expect(actionAllowed('ignore', 'booked')).toBe(false)
  })

  it('offers Confirm only with a proposed payer', () => {
    expect(actionsFor('suggested', true)).toEqual(['confirm', 'assign', 'ignore'])
    expect(actionsFor('suggested', false)).toEqual(['assign', 'ignore'])
    expect(actionsFor('unmatched', false)).toEqual(['assign', 'ignore'])
    expect(actionsFor('booked', true)).toEqual(['undo'])
    expect(actionsFor('ignored', false)).toEqual(['restore'])
  })

  it('maps a perspective to its status', () => {
    expect(perspectiveStatus('suggested')).toBe('suggested')
    expect(perspectiveStatus('all')).toBeNull()
  })
})

describe('transferHash and planImport', () => {
  it('fingerprints the folded transfer within the club', () => {
    const base = transferHash('org', entry(100, 'GW-7K2M Składka'))
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    expect(transferHash('org', { ...entry(100, 'gw 7k2m  skladka'), counterpartyAccount: '61-1090' })).toBe(base)
    expect(transferHash('other', entry(100, 'GW-7K2M Składka'))).not.toBe(base)
    expect(transferHash('org', entry(101, 'GW-7K2M Składka'))).not.toBe(base)
  })

  it('skips debits and duplicates, in the file and already stored', () => {
    const stored = transferHash('org', entry(300))
    const plan = planImport(
      'org',
      [entry(100), entry(-50), entry(0), entry(100), entry(300), entry(200)],
      new Set([stored]),
    )
    expect(plan.debits).toBe(2)
    expect(plan.duplicates).toBe(2)
    expect(plan.fresh.map((row) => row.amount)).toEqual([100, 200])
    expect(plan.fresh[0].hash).toBe(transferHash('org', entry(100)))
  })
})

describe('findPayerCodes', () => {
  it('reads codes in their usual spellings, each once', () => {
    expect(findPayerCodes('Składka GW-7K2M listopad, gw 7k2m; GW7K2M')).toEqual(['GW-7K2M'])
    expect(findPayerCodes('GW-7K2M GW-ABCD')).toEqual(['GW-7K2M', 'GW-ABCD'])
  })

  it('ignores codes inside longer words and letters outside the alphabet', () => {
    expect(findPayerCodes('XGW-7K2M')).toEqual([])
    expect(findPayerCodes('GW-7K2MX')).toEqual([])
    expect(findPayerCodes('GW-0012')).toEqual([])
  })
})

describe('containsWords', () => {
  it('matches whole words only, without diacritics or case', () => {
    expect(containsWords('Składka LIS Ola', 'Lis')).toBe(true)
    expect(containsWords('składka za listopad', 'Lis')).toBe(false)
    expect(containsWords('Anna Kowalska-Nowak', 'Kowalska-Nowak')).toBe(true)
    expect(containsWords('Zając Jan', 'Zajac')).toBe(true)
    expect(containsWords('anything', ' - ')).toBe(false)
  })
})

describe('allocation', () => {
  const charges = [charge('b', '2026-11-05', 8500), charge('a', '2026-10-05', 15000)]

  it('knows when an amount pays whole charges, oldest first', () => {
    expect(paysWholeCharges(charges, 15000)).toBe(true)
    expect(paysWholeCharges(charges, 23500)).toBe(true)
    expect(paysWholeCharges(charges, 8500)).toBe(false)
    expect(paysWholeCharges(charges, 30000)).toBe(false)
    expect(paysWholeCharges([], 100)).toBe(false)
  })

  it('spreads an amount oldest first and keeps the overpayment apart', () => {
    expect(allocateTransfer(charges, 20000)).toEqual({
      allocation: [
        { chargeId: 'a', amount: 15000 },
        { chargeId: 'b', amount: 5000 },
      ],
      unallocated: 0,
    })
    expect(allocateTransfer(charges, 25000).unallocated).toBe(1500)
  })

  it('takes the recorded allocation off the charges', () => {
    expect(
      afterAllocation(charges, [
        { chargeId: 'a', amount: 15000 },
        { chargeId: 'b', amount: 500 },
      ]),
    ).toEqual([charge('b', '2026-11-05', 8000)])
    expect(afterAllocation(charges, [{ chargeId: 'a', amount: 100 }])).toEqual([
      charge('b', '2026-11-05', 8500),
      charge('a', '2026-10-05', 14900),
    ])
  })
})

describe('matchTransfer', () => {
  const lis: PayerCandidate = {
    personId: 'lis',
    code: 'GW-7K2M',
    surnames: ['Lis', 'Zając'],
    charges: [charge('a', '2026-10-05', 15000), charge('b', '2026-11-05', 8500)],
  }
  const nowak: PayerCandidate = {
    personId: 'nowak',
    code: 'GW-ABCD',
    surnames: ['Nowak'],
    charges: [charge('c', '2026-10-05', 10000)],
  }
  const empty: PayerCandidate = { personId: 'empty', code: 'GW-EEEE', surnames: ['Pusty'], charges: [] }
  const uncoded: PayerCandidate = {
    personId: 'uncoded',
    code: null,
    surnames: ['Kot'],
    charges: [charge('d', '2026-10-05', 5000)],
  }
  const payers = [lis, nowak, empty, uncoded]
  const match = (amount: number, title: string, autoBook = true, counterpartyName = 'Bank') =>
    matchTransfer({ amount, title, counterpartyName, payers, autoBook })

  it('records a code with an amount covering whole charges when auto-recording is on', () => {
    expect(match(23500, 'GW-7K2M składka')).toEqual({
      status: 'booked',
      payerPersonId: 'lis',
      allocation: [
        { chargeId: 'a', amount: 15000 },
        { chargeId: 'b', amount: 8500 },
      ],
      reason: 'code_exact',
      autoBooked: true,
    })
    expect(match(15000, 'gw 7k2m')).toMatchObject({ status: 'booked', allocation: [{ chargeId: 'a', amount: 15000 }] })
  })

  it('leaves the same match to confirm when auto-recording is off', () => {
    expect(match(23500, 'GW-7K2M', false)).toMatchObject({
      status: 'suggested',
      reason: 'code_exact',
      autoBooked: false,
    })
  })

  it('sends overpayments and underpayments to confirmation', () => {
    expect(match(30000, 'GW-7K2M')).toMatchObject({ status: 'suggested', reason: 'code_overpayment' })
    expect(match(10000, 'GW-7K2M')).toMatchObject({
      status: 'suggested',
      reason: 'code_underpayment',
      allocation: [{ chargeId: 'a', amount: 10000 }],
    })
  })

  it('reads the code from the sender too', () => {
    expect(match(10000, 'składka', true, 'Jan GW-ABCD')).toMatchObject({ status: 'booked', payerPersonId: 'nowak' })
  })

  it('leaves a payer without open charges, or two codes, unmatched', () => {
    expect(match(100, 'GW-EEEE')).toEqual({
      status: 'unmatched',
      payerPersonId: 'empty',
      allocation: [],
      reason: 'code_no_open_charges',
      autoBooked: false,
    })
    expect(match(100, 'GW-7K2M GW-ABCD')).toMatchObject({ status: 'unmatched', reason: 'code_ambiguous' })
  })

  it('suggests a whole-word surname with an amount covering whole charges', () => {
    expect(match(15000, 'składka Ola', true, 'Jan Zając')).toEqual({
      status: 'suggested',
      payerPersonId: 'lis',
      allocation: [{ chargeId: 'a', amount: 15000 }],
      reason: 'surname_amount',
      autoBooked: false,
    })
    expect(match(5000, 'Kot składka')).toMatchObject({ status: 'suggested', payerPersonId: 'uncoded' })
  })

  it('leaves the rest unmatched', () => {
    expect(match(15000, 'składka za listopad')).toMatchObject({ status: 'unmatched', reason: 'no_match' })
    expect(match(12345, 'Lis')).toMatchObject({ status: 'unmatched', reason: 'no_match' })
    expect(match(100, 'Pusty darowizna')).toMatchObject({ status: 'unmatched', reason: 'no_match' })
    expect(match(10000, 'Lis Nowak')).toMatchObject({ status: 'unmatched', reason: 'no_match' })
    expect(match(500, 'GW-ZZZZ darowizna')).toMatchObject({ status: 'unmatched', payerPersonId: null })
  })
})

describe('importCounts', () => {
  it('counts every entry of the file', () => {
    expect(importCounts(['booked', 'suggested', 'suggested', 'unmatched'], 3)).toEqual({
      total: 7,
      booked: 1,
      suggested: 2,
      unmatched: 1,
      skipped: 3,
    })
  })
})
