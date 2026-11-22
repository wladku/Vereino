import { describe, expect, it } from '@jest/globals'
import {
  INVARIANTS_DRIFT_SIGNAL,
  INVARIANTS_VERIFIED_SIGNAL,
  MAX_ALERT_IDS,
  alertFields,
  chargeDrift,
  chargeDrifts,
  documentNumber,
  hasDrift,
  heartbeatUrl,
  invariantsReport,
  numberingDrifts,
  parseDocumentNumber,
  type ChargeLedgerTotal,
  type NumberedEntry,
} from '../invariants'

function charge(overrides: Partial<ChargeLedgerTotal> = {}): ChargeLedgerTotal {
  return { id: 'c1', status: 'open', amount: 10_000, discountAmount: 0, paid: 0, ...overrides }
}

function receipt(number: string, issueKey = 'a', issuedOn: string | null = '2026-11-10'): NumberedEntry {
  return { number, issueKey, issuedOn }
}

describe('chargeDrift: the status a charge must have given what was paid on it', () => {
  it('accepts every status that matches its payments', () => {
    expect(chargeDrift(charge())).toBeNull()
    expect(chargeDrift(charge({ status: 'partially_paid', paid: 4_000 }))).toBeNull()
    expect(chargeDrift(charge({ status: 'paid', paid: 10_000 }))).toBeNull()
    // The amount due is the amount less the discount.
    expect(chargeDrift(charge({ status: 'paid', discountAmount: 3_300, paid: 6_700 }))).toBeNull()
  })

  it('accepts a cancelled or forfeited charge with nothing paid on it, whatever was paid and reversed', () => {
    expect(chargeDrift(charge({ status: 'cancelled' }))).toBeNull()
    expect(chargeDrift(charge({ status: 'forfeited' }))).toBeNull()
  })

  it('accepts a charge with nothing due as open (a fully discounted fee) or paid (a free rental)', () => {
    expect(chargeDrift(charge({ amount: 0 }))).toBeNull()
    expect(chargeDrift(charge({ amount: 0, status: 'paid' }))).toBeNull()
    expect(chargeDrift(charge({ amount: 5_000, discountAmount: 5_000, status: 'paid' }))).toBeNull()
  })

  it('names the status the payments give when the stored one differs', () => {
    expect(chargeDrift(charge({ status: 'paid', paid: 4_000 }))).toEqual({
      chargeId: 'c1',
      kind: 'status',
      status: 'paid',
      expectedStatus: 'partially_paid',
    })
    expect(chargeDrift(charge({ status: 'open', paid: 10_000 }))?.expectedStatus).toBe('paid')
    expect(chargeDrift(charge({ status: 'partially_paid', paid: 0 }))?.expectedStatus).toBe('open')
    expect(chargeDrift(charge({ status: 'paid', paid: 0 }))?.expectedStatus).toBe('open')
  })

  it('treats an unknown status as drift, judged as if it were open', () => {
    expect(chargeDrift(charge({ status: 'settled', paid: 4_000 }))).toEqual({
      chargeId: 'c1',
      kind: 'status',
      status: 'settled',
      expectedStatus: 'partially_paid',
    })
  })

  it('reports a paid amount out of range: negative, above the amount due, or anything on a cancelled charge', () => {
    const outOfRange = { chargeId: 'c1', kind: 'paid_out_of_range', expectedStatus: null }
    expect(chargeDrift(charge({ paid: -100 }))).toEqual({ ...outOfRange, status: 'open' })
    expect(chargeDrift(charge({ status: 'paid', paid: 10_001 }))).toEqual({ ...outOfRange, status: 'paid' })
    expect(chargeDrift(charge({ status: 'cancelled', paid: 100 }))).toEqual({ ...outOfRange, status: 'cancelled' })
    expect(chargeDrift(charge({ status: 'forfeited', paid: -100 }))).toEqual({ ...outOfRange, status: 'forfeited' })
  })

  it('lists the drifted charges of a club in the order given', () => {
    const rows = [charge({ id: 'a' }), charge({ id: 'b', status: 'paid', paid: 1 }), charge({ id: 'c', paid: -1 })]
    expect(chargeDrifts(rows).map((drift) => [drift.chargeId, drift.kind])).toEqual([
      ['b', 'status'],
      ['c', 'paid_out_of_range'],
    ])
  })
})

describe('document numbers', () => {
  it('parses the month and sequence of a number of the series, null for anything else', () => {
    expect(parseDocumentNumber('KP', 'KP/2026/11/007')).toEqual({ month: '2026-11', sequence: 7 })
    expect(parseDocumentNumber('RG', 'RG/2026/01/1000')).toEqual({ month: '2026-01', sequence: 1000 })
    expect(parseDocumentNumber('KP', 'RG/2026/11/007')).toBeNull()
    expect(parseDocumentNumber('KP', 'KP/2026/13/007')).toBeNull()
    expect(parseDocumentNumber('KP', 'KP/2026/11/07')).toBeNull()
    expect(parseDocumentNumber('KP', 'KP/2026/11/000')).toBeNull()
  })

  it('formats a number the way the commands issue it', () => {
    expect(documentNumber('KP', '2026-11', 3)).toBe('KP/2026/11/003')
    expect(documentNumber('RG', '2026-02', 1234)).toBe('RG/2026/02/1234')
  })
})

describe('numberingDrifts: unique and consecutive per club and month', () => {
  it('finds nothing in consecutive numbers, a receipt shared by the payments of one acceptance included', () => {
    const entries = [
      receipt('KP/2026/11/001'),
      receipt('KP/2026/11/001'),
      receipt('KP/2026/11/002', 'b'),
      receipt('KP/2026/12/001', 'c', '2026-12-01'),
    ]
    expect(numberingDrifts('KP', entries)).toEqual([])
    expect(numberingDrifts('KP', [])).toEqual([])
  })

  it('reports a number issued to two acceptances, a gap and a number outside its month, month by month', () => {
    const entries = [
      receipt('KP/2026/12/002', 'x', '2026-12-03'),
      receipt('KP/2026/11/001', 'a'),
      receipt('KP/2026/11/001', 'b'),
      receipt('KP/2026/11/004', 'c'),
      receipt('KP/2026/12/001', 'y', '2026-11-30'),
    ]
    expect(numberingDrifts('KP', entries)).toEqual([
      { series: 'KP', kind: 'duplicate', month: '2026-11', numbers: ['KP/2026/11/001'], count: 1 },
      { series: 'KP', kind: 'gap', month: '2026-11', numbers: ['KP/2026/11/002', 'KP/2026/11/003'], count: 2 },
      { series: 'KP', kind: 'wrong_month', month: '2026-12', numbers: ['KP/2026/12/001'], count: 1 },
    ])
  })

  it('reports malformed numbers once each, sorted, and judges a handover without a day by its number only', () => {
    const entries = [
      { number: 'RG/2026/11/x', issueKey: 'h1', issuedOn: null },
      { number: 'RG/2026/11/001', issueKey: 'h2', issuedOn: null },
      { number: 'KP/2026/11/002', issueKey: 'h3', issuedOn: null },
      { number: 'KP/2026/11/002', issueKey: 'h4', issuedOn: null },
    ]
    expect(numberingDrifts('RG', entries)).toEqual([
      { series: 'RG', kind: 'malformed', month: null, numbers: ['KP/2026/11/002', 'RG/2026/11/x'], count: 2 },
    ])
  })

  it('caps the listed numbers and keeps the full count', () => {
    const drift = numberingDrifts('RG', [{ number: 'RG/2026/11/100', issueKey: 'h', issuedOn: null }])
    expect(drift).toHaveLength(1)
    expect(drift[0].numbers).toHaveLength(MAX_ALERT_IDS)
    expect(drift[0].numbers[0]).toBe('RG/2026/11/001')
    expect(drift[0].count).toBe(99)
  })
})

describe('the report and its alert', () => {
  const clean = invariantsReport({
    charges: [charge(), charge({ id: 'c2', status: 'paid', paid: 10_000 })],
    receipts: [receipt('KP/2026/11/001'), receipt('KP/2026/11/001')],
    handovers: [{ number: 'RG/2026/11/001', issueKey: 'h1', issuedOn: null }],
  })

  it('counts what was read (one receipt per number) and finds no drift in a clean club', () => {
    expect(clean).toEqual({
      counts: { charges: 2, receipts: 1, handovers: 1 },
      chargeDrifts: [],
      numberingDrifts: [],
    })
    expect(hasDrift(clean)).toBe(false)
    expect(alertFields(clean)).toEqual({
      signal: INVARIANTS_VERIFIED_SIGNAL,
      charges: 2,
      receipts: 1,
      handovers: 1,
      driftedCharges: 0,
      numberingProblems: 0,
    })
  })

  it('raises the drift signal with the charge ids and the numbering problems, ids and counts only', () => {
    const drifted = invariantsReport({
      charges: [charge({ id: 'c9', status: 'paid', paid: 4_000 })],
      receipts: [receipt('KP/2026/11/002')],
      handovers: [],
    })
    expect(hasDrift(drifted)).toBe(true)
    expect(alertFields(drifted)).toEqual({
      signal: INVARIANTS_DRIFT_SIGNAL,
      charges: 1,
      receipts: 1,
      handovers: 0,
      driftedCharges: 1,
      numberingProblems: 1,
      chargeDrifts: JSON.stringify([['c9', 'status', 'paid', 'partially_paid']]),
      numberingDrifts: JSON.stringify([['KP', 'gap', '2026-11', 1, ['KP/2026/11/001']]]),
    })
  })

  it('alerts on numbering alone, and caps the listed charges', () => {
    const numberingOnly = invariantsReport({ charges: [], receipts: [], handovers: [] })
    numberingOnly.numberingDrifts.push({ series: 'RG', kind: 'gap', month: '2026-11', numbers: [], count: 0 })
    expect(hasDrift(numberingOnly)).toBe(true)
    expect(alertFields(numberingOnly).chargeDrifts).toBeUndefined()

    const many = Array.from({ length: MAX_ALERT_IDS + 5 }, (_, index) =>
      charge({ id: `c${String(index)}`, status: 'paid', paid: 1 }),
    )
    const report = invariantsReport({ charges: many, receipts: [], handovers: [] })
    expect(alertFields(report).driftedCharges).toBe(MAX_ALERT_IDS + 5)
    expect(JSON.parse(String(alertFields(report).chargeDrifts))).toHaveLength(MAX_ALERT_IDS)
    expect(alertFields(report).numberingDrifts).toBeUndefined()
  })

  it('pings the heartbeat check, its failure URL after drift, nothing without a URL', () => {
    expect(heartbeatUrl('https://hc.example/abc', false)).toBe('https://hc.example/abc')
    expect(heartbeatUrl(' https://hc.example/abc/ ', true)).toBe('https://hc.example/abc/fail')
    expect(heartbeatUrl(undefined, true)).toBeNull()
    expect(heartbeatUrl('   ', false)).toBeNull()
  })
})
