import { describe, expect, it } from '@jest/globals'
import {
  anonymiseCutoff,
  anonymisedBirthDate,
  applicantKeySource,
  applicationFlags,
  cleanName,
  closedLinkExpiry,
  closedTabSince,
  comparableName,
  confirmedState,
  isGroupFull,
  isOverdue,
  normalizeEmail,
  normalizePhone,
  tabOf,
  tabStates,
  unconfirmedCutoff,
  waitingNumbers,
} from '../applications'

const at = (iso: string) => new Date(iso)

describe('contact data (BR-J1, BR-J3)', () => {
  it('normalises e-mail and names', () => {
    expect(normalizeEmail('  Anna@Example.ORG ')).toBe('anna@example.org')
    expect(cleanName('  Anna   Maria ')).toBe('Anna Maria')
    expect(comparableName(' Żaneta  Łęcka ')).toBe('zaneta łecka')
  })

  it('normalises phones to E.164', () => {
    expect(normalizePhone('600 100 200')).toBe('+48600100200')
    expect(normalizePhone('0048 600-100-200')).toBe('+48600100200')
    expect(normalizePhone('+49 (30) 1234567')).toBe('+49301234567')
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('+0123456789')).toBeNull()
  })

  it('builds the same identity for the same application typed differently', () => {
    const a = applicantKeySource({ email: 'A@x.pl', firstName: 'Óla', lastName: 'Nowak', birthDate: '2017-03-14' })
    const b = applicantKeySource({ email: ' a@x.pl', firstName: 'ola ', lastName: 'NOWAK', birthDate: '2017-03-14' })
    expect(a).toBe(b)
  })
})

describe('places and the waiting list (BR-J4, DD-J09)', () => {
  it('tells a full group', () => {
    expect(isGroupFull({ placesLimit: null, occupied: 40 })).toBe(false)
    expect(isGroupFull({ placesLimit: 18, occupied: 17 })).toBe(false)
    expect(isGroupFull({ placesLimit: 18, occupied: 18 })).toBe(true)
  })

  it('sends a confirmed application to the waiting list only for a full chosen group', () => {
    expect(confirmedState(null)).toBe('new')
    expect(confirmedState({ placesLimit: 2, occupied: 1 })).toBe('new')
    expect(confirmedState({ placesLimit: 2, occupied: 2 })).toBe('waiting')
  })

  it('numbers the waiting list per group by entry time, ties by id', () => {
    const numbers = waitingNumbers([
      { id: 'b', groupId: 'g1', waitingSince: at('2026-11-02T10:00:00Z') },
      { id: 'a', groupId: 'g1', waitingSince: at('2026-11-02T10:00:00Z') },
      { id: 'c', groupId: 'g1', waitingSince: at('2026-11-01T10:00:00Z') },
      { id: 'd', groupId: 'g2', waitingSince: at('2026-11-05T10:00:00Z') },
      { id: 'e', groupId: null, waitingSince: at('2026-11-05T10:00:00Z') },
      { id: 'f', groupId: 'g2', waitingSince: null },
      { id: 'x', groupId: 'g3', waitingSince: at('2026-11-05T10:00:00Z') },
      { id: 'y', groupId: 'g3', waitingSince: at('2026-11-05T10:00:00Z') },
    ])
    expect(numbers.get('x')).toBe(1)
    expect(numbers.get('y')).toBe(2)
    expect(numbers.get('c')).toBe(1)
    expect(numbers.get('a')).toBe(2)
    expect(numbers.get('b')).toBe(3)
    expect(numbers.get('d')).toBe(1)
    expect(numbers.has('e')).toBe(false)
    expect(numbers.has('f')).toBe(false)
  })
})

describe('overdue and flags (REQ-J11, *Answer time*)', () => {
  const now = at('2026-11-26T12:00:00Z')
  it('counts a new application past the answer time', () => {
    expect(isOverdue({ state: 'new', confirmedAt: at('2026-11-18T11:00:00Z') }, 7, now)).toBe(true)
    expect(isOverdue({ state: 'new', confirmedAt: at('2026-11-20T11:00:00Z') }, 7, now)).toBe(false)
    expect(isOverdue({ state: 'new', confirmedAt: null }, 7, now)).toBe(false)
    expect(isOverdue({ state: 'waiting', confirmedAt: at('2026-10-01T11:00:00Z') }, 7, now)).toBe(false)
    expect(isOverdue({ state: 'trial', confirmedAt: at('2026-10-01T11:00:00Z'), trialOver: true }, 7, now)).toBe(true)
    expect(isOverdue({ state: 'trial', confirmedAt: at('2026-10-01T11:00:00Z') }, 7, now)).toBe(false)
  })

  it('lists the flags in display order', () => {
    expect(
      applicationFlags({ ageFit: 'outside', groupFull: true, wantsTrial: true, duplicates: 1, overdue: true }),
    ).toEqual(['outside_age', 'group_full', 'wants_trial', 'possible_duplicate', 'overdue'])
    expect(
      applicationFlags({ ageFit: 'fits', groupFull: false, wantsTrial: false, duplicates: 0, overdue: false }),
    ).toEqual([])
  })
})

describe('tabs (M-J2)', () => {
  it('maps tabs to states and states to tabs', () => {
    expect(tabStates('new')).toEqual(['new', 'trial'])
    expect(tabStates('trial')).toEqual(['trial'])
    expect(tabStates('waiting')).toEqual(['waiting'])
    expect(tabStates('closed')).toEqual(['accepted', 'rejected', 'withdrawn', 'expired'])
    expect(tabOf('new', false)).toBe('new')
    expect(tabOf('trial', true)).toBe('new')
    expect(tabOf('trial', false)).toBe('trial')
    expect(tabOf('waiting', false)).toBe('waiting')
    expect(tabOf('unconfirmed', false)).toBeNull()
    expect(tabOf('rejected', false)).toBe('closed')
  })
})

describe('retention (R22, R23, DD-J07)', () => {
  const now = at('2026-11-26T12:00:00Z')
  it('computes the cut-offs', () => {
    expect(unconfirmedCutoff(now).toISOString()).toBe('2026-11-25T12:00:00.000Z')
    expect(anonymiseCutoff(now).toISOString()).toBe('2026-10-27T12:00:00.000Z')
    expect(closedTabSince(now).toISOString()).toBe('2026-10-27T12:00:00.000Z')
    expect(closedLinkExpiry(now).toISOString()).toBe('2026-12-26T12:00:00.000Z')
  })
  it('keeps only the birth year', () => {
    expect(anonymisedBirthDate('2017-03-14')).toBe('2017-01-01')
    expect(anonymisedBirthDate(null)).toBeNull()
  })
})
