import { describe, expect, it } from '@jest/globals'
import {
  BACKEND_HOME,
  MEMBER_HOME,
  SELF_CONSENT_KINDS,
  applySelfConsent,
  memberContexts,
  memberLanding,
  memberLocale,
  ownPaymentsAccess,
  selfConsentView,
  withNotice,
} from '../member-rules'

const given = new Date('2026-10-01T08:00:00.000Z')
const now = new Date('2026-10-29T10:15:00.000Z')

describe('SELF_CONSENT_KINDS', () => {
  it('lists the two consents of the member profile', () => {
    expect(SELF_CONSENT_KINDS).toEqual(['shareContactWithCoaches', 'sharePresenceWithGuardians'])
  })
})

describe('selfConsentView', () => {
  it('shows a set column as granted with its instant', () => {
    expect(selfConsentView(given)).toEqual({ granted: true, at: '2026-10-01T08:00:00.000Z' })
    expect(selfConsentView('2026-10-01T08:00:00Z')).toEqual({ granted: true, at: '2026-10-01T08:00:00.000Z' })
  })

  it('shows a null, missing or unreadable column as not granted', () => {
    expect(selfConsentView(null)).toEqual({ granted: false, at: null })
    expect(selfConsentView(undefined)).toEqual({ granted: false, at: null })
    expect(selfConsentView('not a date')).toEqual({ granted: false, at: null })
  })
})

describe('applySelfConsent', () => {
  it('keeps the value when no state is requested', () => {
    expect(applySelfConsent(given, undefined, now)).toEqual({ at: given, changed: false })
    expect(applySelfConsent(null, undefined, now)).toEqual({ at: null, changed: false })
  })

  it('grants at now, and keeps the first date when the consent is already given', () => {
    expect(applySelfConsent(null, true, now)).toEqual({ at: now, changed: true })
    expect(applySelfConsent(given, true, now)).toEqual({ at: given, changed: false })
  })

  it('withdraws to null at any time, and does nothing for a consent never given', () => {
    expect(applySelfConsent(given, false, now)).toEqual({ at: null, changed: true })
    expect(applySelfConsent(null, false, now)).toEqual({ at: null, changed: false })
  })
})

describe('ownPaymentsAccess', () => {
  const today = '2026-10-29'

  it('refuses a user without a person', () => {
    expect(ownPaymentsAccess({ hasPerson: false, hasFeature: true, birthDate: '1980-01-01' }, today)).toBe('no_person')
  })

  it('refuses a minor even with a manually granted feature, and a person without a date of birth', () => {
    expect(ownPaymentsAccess({ hasPerson: true, hasFeature: true, birthDate: '2012-03-05' }, today)).toBe('minor')
    expect(ownPaymentsAccess({ hasPerson: true, hasFeature: false, birthDate: '2012-03-05' }, today)).toBe('minor')
    expect(ownPaymentsAccess({ hasPerson: true, hasFeature: true, birthDate: null }, today)).toBe('minor')
  })

  it('counts the 18th birthday as adult', () => {
    expect(ownPaymentsAccess({ hasPerson: true, hasFeature: true, birthDate: '2008-10-30' }, today)).toBe('minor')
    expect(ownPaymentsAccess({ hasPerson: true, hasFeature: true, birthDate: '2008-10-29' }, today)).toBe('allowed')
  })

  it('refuses an adult without the payer feature', () => {
    expect(ownPaymentsAccess({ hasPerson: true, hasFeature: false, birthDate: '1980-01-01' }, today)).toBe('no_feature')
  })
})

describe('memberLocale', () => {
  const supported = ['en', 'pl', 'de']

  it('takes the first served candidate: preferred, then the club default, then the request locale', () => {
    expect(memberLocale(['en', 'pl', 'de'], supported, 'en')).toBe('en')
    expect(memberLocale([null, 'pl', 'de'], supported, 'en')).toBe('pl')
    expect(memberLocale([undefined, 'pt-br', 'de'], supported, 'en')).toBe('de')
  })

  it('normalizes case and blanks, and falls back when nothing is served', () => {
    expect(memberLocale([' PL '], supported, 'en')).toBe('pl')
    expect(memberLocale(['', '  ', 'fr'], supported, 'en')).toBe('en')
    expect(memberLocale([], supported, 'en')).toBe('en')
  })
})

describe('memberContexts', () => {
  it('lists the provider grant kinds the scope holds in the switcher order', () => {
    expect(
      memberContexts([
        { kind: 'club_admin' },
        { kind: 'guardian', ids: ['w1'] },
        { kind: 'self', ids: ['p1'] },
        { kind: 'coordinator', ids: ['s1'] },
        { kind: 'coach', ids: ['g1'] },
      ]),
    ).toEqual(['self', 'guardian', 'coach', 'coordinator', 'club_admin'])
  })

  it('ignores the marker and job grants and an empty scope', () => {
    expect(memberContexts([{ kind: 'self_user', ids: ['u1'] }, { kind: 'system_job' }])).toEqual([])
    expect(memberContexts([])).toEqual([])
  })
})

describe('memberLanding', () => {
  it('sends a linked member with people.self to /club', () => {
    expect(memberLanding({ redirect: BACKEND_HOME, linked: true, selfFeature: true })).toEqual({
      redirect: MEMBER_HOME,
      notice: false,
    })
  })

  it('keeps an unlinked account on /backend with the notice', () => {
    expect(memberLanding({ redirect: BACKEND_HOME, linked: false, selfFeature: true })).toEqual({
      redirect: BACKEND_HOME,
      notice: true,
    })
  })

  it('keeps the platform answer for a linked user without people.self and for an explicit redirect', () => {
    expect(memberLanding({ redirect: BACKEND_HOME, linked: true, selfFeature: false })).toBeNull()
    expect(memberLanding({ redirect: '/backend/people/persons', linked: true, selfFeature: true })).toBeNull()
    expect(memberLanding({ redirect: undefined, linked: false, selfFeature: false })).toBeNull()
  })
})

describe('withNotice', () => {
  it('adds the encoded flash message with the info type', () => {
    expect(withNotice('/backend', 'Not linked — contact the club')).toBe(
      '/backend?flash=Not+linked+%E2%80%94+contact+the+club&type=info',
    )
  })
})
