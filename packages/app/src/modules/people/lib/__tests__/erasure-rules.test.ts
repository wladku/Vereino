import { describe, expect, it } from '@jest/globals'
import {
  anonymizeBlockers,
  lastNameConfirmed,
  nameErasureDue,
  nameKeptUntil,
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
