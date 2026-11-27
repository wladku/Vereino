import { describe, expect, it } from '@jest/globals'
import {
  anonymizeBlockers,
  erasureAudit,
  lastNameConfirmed,
  nameErasureDue,
  nameKeptUntil,
  peopleErasurePart,
  personInUseReasons,
  visibleName,
  type AnonymizeFacts,
} from '../erasure-rules'

const TODAY = '2026-11-20'

function facts(extra: Partial<AnonymizeFacts> = {}): AnonymizeFacts {
  return {
    leftOn: '2026-10-31',
    anonymizedAt: null,
    hasAccount: false,
    activeGuardianships: 0,
    requestRecorded: true,
    contributorNotices: [],
    ...extra,
  }
}

describe('anonymizeBlockers', () => {
  it('allows a former person without account, charges, cash or guardianships, with a request', () => {
    expect(anonymizeBlockers(facts(), TODAY)).toEqual([])
  })

  it('allows the last day itself (the person is former from that day)', () => {
    expect(anonymizeBlockers(facts({ leftOn: TODAY }), TODAY)).toEqual([])
  })

  it('refuses an anonymised person once more and reports nothing else', () => {
    expect(anonymizeBlockers(facts({ anonymizedAt: new Date(), hasAccount: true }), TODAY)).toEqual([
      { code: 'already_anonymized' },
    ])
  })

  it('lists every reason in a stable order', () => {
    expect(
      anonymizeBlockers(
        facts({
          leftOn: null,
          hasAccount: true,
          activeGuardianships: 2,
          requestRecorded: false,
          contributorNotices: [
            { module: 'payments', code: 'cash_held', params: { amount: 5000 } },
            { module: 'payments', code: 'open_charges', recordId: 'charge-1', params: { count: 1 } },
            { module: 'payments', code: 'something_else' },
          ],
        }),
        TODAY,
      ),
    ).toEqual([
      { code: 'not_left' },
      { code: 'account_open' },
      { code: 'active_guardianship', params: { count: 2 } },
      { code: 'cash_held', module: 'payments', params: { amount: 5000 } },
      { code: 'open_charges', module: 'payments', recordId: 'charge-1', params: { count: 1 } },
      { code: 'request_missing' },
    ])
  })

  it('refuses a person whose last day is still ahead', () => {
    expect(anonymizeBlockers(facts({ leftOn: '2026-11-30' }), TODAY)).toEqual([{ code: 'not_left' }])
  })

  it('copies a notice without record or params as it is', () => {
    expect(
      anonymizeBlockers(facts({ contributorNotices: [{ module: 'payments', code: 'open_charges' }] }), TODAY),
    ).toEqual([{ code: 'open_charges', module: 'payments' }])
  })
})

describe('lastNameConfirmed', () => {
  it('ignores case and spaces', () => {
    expect(lastNameConfirmed('  kowalska ', 'Kowalska')).toBe(true)
    expect(lastNameConfirmed('NOWAK  KOWALSKA', 'Nowak Kowalska')).toBe(true)
    expect(lastNameConfirmed('źdźbło', 'ŹDŹBŁO')).toBe(true)
  })

  it('keeps diacritics and refuses another name', () => {
    expect(lastNameConfirmed('Nowak', 'Nówak')).toBe(false)
    expect(lastNameConfirmed('Kowalski', 'Kowalska')).toBe(false)
  })

  it('never confirms an empty last name', () => {
    expect(lastNameConfirmed('', '')).toBe(false)
    expect(lastNameConfirmed(' ', '  ')).toBe(false)
  })
})

describe('the retention hold', () => {
  it('keeps the name until a hold that is today or later', () => {
    expect(nameKeptUntil('2031-12-31', TODAY)).toBe('2031-12-31')
    expect(nameKeptUntil(TODAY, TODAY)).toBe(TODAY)
  })

  it('keeps nothing without a payment or after the hold', () => {
    expect(nameKeptUntil(null, TODAY)).toBeNull()
    expect(nameKeptUntil('2025-12-31', TODAY)).toBeNull()
  })

  it('makes step 5 due only the day after the hold', () => {
    expect(nameErasureDue(null, TODAY)).toBe(false)
    expect(nameErasureDue(TODAY, TODAY)).toBe(false)
    expect(nameErasureDue('2026-11-19', TODAY)).toBe(true)
  })
})

describe('personInUseReasons', () => {
  it('finds no reason for a mistaken person', () => {
    expect(
      personInUseReasons({ hasAccount: false, guardianships: 0, roleAssignments: 0, departureRequests: 0 }, []),
    ).toEqual([])
  })

  it('lists the own records first, then the modules', () => {
    expect(
      personInUseReasons({ hasAccount: true, guardianships: 1, roleAssignments: 2, departureRequests: 3 }, [
        'groups',
        'activities',
      ]),
    ).toEqual([
      { code: 'account' },
      { code: 'guardianships', params: { count: 1 } },
      { code: 'role_assignments', params: { count: 2 } },
      { code: 'departure_requests', params: { count: 3 } },
      { code: 'history', module: 'groups' },
      { code: 'history', module: 'activities' },
    ])
  })
})

describe('visibleName', () => {
  const label = 'Former member'

  it('shows a person who is not anonymised as is', () => {
    expect(visibleName({ firstName: 'Jan', lastName: 'Kowalski' }, label, false)).toEqual({
      firstName: 'Jan',
      lastName: 'Kowalski',
    })
  })

  it('shows a name kept under the hold only to a reader with people.manage', () => {
    const person = { firstName: 'Jan', lastName: 'Kowalski', anonymizedAt: '2026-11-20T10:00:00.000Z' }
    expect(visibleName(person, label, true)).toEqual({ firstName: 'Jan', lastName: 'Kowalski' })
    expect(visibleName(person, label, false)).toEqual({ firstName: label, lastName: '' })
  })

  it('keeps a half-cleared name visible to the administrator', () => {
    expect(visibleName({ firstName: '', lastName: 'Kowalski', anonymizedAt: new Date() }, label, true)).toEqual({
      firstName: '',
      lastName: 'Kowalski',
    })
  })

  it('shows the label for a cleared name to everyone', () => {
    expect(visibleName({ firstName: '', lastName: ' ', anonymizedAt: new Date() }, label, true)).toEqual({
      firstName: label,
      lastName: '',
    })
  })
})

describe('peopleErasurePart', () => {
  it('names the person row and every table with changed rows, and keeps the request', () => {
    const part = peopleErasurePart({ guardianships: 2, departureRequests: 1, importRows: 0, consentEvents: 0 }, null)
    expect(part.touched).toEqual([
      { table: 'people_persons', rows: 1 },
      { table: 'people_guardianships', rows: 2 },
      { table: 'people_departure_requests', rows: 1 },
    ])
    expect(part.kept.map((entry) => entry.category)).toEqual(['erasure_request_and_decision'])
    expect(part.kept[0]).toMatchObject({ retention: 'R13', tables: ['people_departure_requests'] })
  })

  it('keeps the name with its basis while the retention hold lasts', () => {
    const part = peopleErasurePart(
      { guardianships: 0, departureRequests: 0, importRows: 3, consentEvents: 2 },
      '2031-12-31',
    )
    expect(part.touched).toEqual([
      { table: 'people_persons', rows: 1 },
      { table: 'people_import_rows', rows: 3 },
      { table: 'people_consent_events', rows: 2 },
    ])
    expect(part.kept[1]).toMatchObject({ category: 'name_under_retention_hold', retention: 'R2' })
    expect(part.kept[1].basis).toContain('6(1)(c)')
  })

  it('keeps no request for an anonymisation by the retention sweep (#471)', () => {
    const part = peopleErasurePart(
      { guardianships: 0, departureRequests: 0, importRows: 0, consentEvents: 0 },
      null,
      false,
    )
    expect(part).toEqual({ touched: [{ table: 'people_persons', rows: 1 }], kept: [] })
  })
})

describe('erasureAudit', () => {
  const accounting = { category: 'accounting_records', basis: 'art. 6(1)(c)', retention: 'R1', tables: ['a', 'b'] }

  it('joins the parts in order, adds rows of a repeated table and drops tables without rows', () => {
    expect(
      erasureAudit([
        { touched: [{ table: 'people_persons', rows: 1 }], kept: [] },
        {
          touched: [
            { table: 'payments_orders', rows: 2 },
            { table: 'payments_charges', rows: 0 },
          ],
          kept: [accounting],
        },
        { touched: [{ table: 'payments_orders', rows: 1 }], kept: [] },
      ]),
    ).toEqual({
      tablesTouched: [
        { table: 'people_persons', rows: 1 },
        { table: 'payments_orders', rows: 3 },
      ],
      keptData: [accounting],
    })
  })

  it('keeps the first basis of a repeated category and joins its tables once each', () => {
    const audit = erasureAudit([
      { touched: [], kept: [{ ...accounting, tables: ['a', 'a'] }] },
      { touched: [], kept: [{ ...accounting, basis: 'other', tables: ['b', 'c'] }] },
    ])
    expect(audit.keptData).toEqual([{ ...accounting, tables: ['a', 'b', 'c'] }])
    expect(audit.tablesTouched).toEqual([])
  })

  it('records nothing for no parts', () => {
    expect(erasureAudit([])).toEqual({ tablesTouched: [], keptData: [] })
  })
})
