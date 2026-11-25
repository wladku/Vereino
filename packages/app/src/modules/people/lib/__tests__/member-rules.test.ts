import { describe, expect, it } from '@jest/globals'
import {
  BACKEND_HOME,
  FACILITY_HOME,
  MEMBER_HOME,
  SELF_CONSENT_KINDS,
  applySelfConsent,
  consentAuthorIds,
  consentAuthorRole,
  hasNotLinkedNotice,
  memberContexts,
  memberLanding,
  memberLocale,
  ownPaymentsAccess,
  publicPersonName,
  selfConsentView,
  withConsentAuthors,
  withNotice,
} from '../member-rules'

const given = new Date('2026-10-01T08:00:00.000Z')
const now = new Date('2026-10-29T10:15:00.000Z')

describe('SELF_CONSENT_KINDS', () => {
  it('lists the three consents of the member profile', () => {
    expect(SELF_CONSENT_KINDS).toEqual(['shareContactWithCoaches', 'sharePresenceWithGuardians', 'publishNameConsent'])
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
        { kind: 'facility_operator', ids: ['pl1'] },
        { kind: 'treasurer' },
      ]),
    ).toEqual(['self', 'guardian', 'coach', 'coordinator', 'club_admin', 'facility_operator', 'treasurer'])
  })

  it('ignores the marker and job grants and an empty scope', () => {
    expect(memberContexts([{ kind: 'self_user', ids: ['u1'] }, { kind: 'system_job' }])).toEqual([])
    expect(memberContexts([])).toEqual([])
  })
})

describe('memberLanding', () => {
  const base = {
    redirect: BACKEND_HOME,
    linked: true,
    selfFeature: true,
    memberSide: false,
    grants: ['self'],
    facilityLogFeature: false,
  }
  const landing = (input: Partial<typeof base> & { grants?: string[] }) => memberLanding({ ...base, ...input })

  it('sends a linked member with people.self to /club', () => {
    expect(landing({ memberSide: true, grants: ['self', 'guardian'] })).toEqual({
      redirect: MEMBER_HOME,
      notice: false,
    })
    expect(landing({})).toEqual({ redirect: MEMBER_HOME, notice: false })
  })

  it('sends a coach and a coordinator without a member side to /club', () => {
    expect(landing({ grants: ['self', 'coach'] })?.redirect).toBe(MEMBER_HOME)
    expect(landing({ grants: ['self', 'coordinator'] })?.redirect).toBe(MEMBER_HOME)
  })

  it('sends the attendant without a member side and without a staff grant to /club/facility', () => {
    expect(landing({ grants: ['self', 'facility_operator'], facilityLogFeature: true })).toEqual({
      redirect: FACILITY_HOME,
      notice: false,
    })
    expect(landing({ grants: ['self'], facilityLogFeature: true, selfFeature: false })?.redirect).toBe(FACILITY_HOME)
  })

  it('keeps the attendant with a member side or a staff grant on /club', () => {
    expect(landing({ memberSide: true, facilityLogFeature: true })?.redirect).toBe(MEMBER_HOME)
    for (const staff of ['coach', 'coordinator']) {
      expect(landing({ grants: ['self', staff], facilityLogFeature: true })?.redirect).toBe(MEMBER_HOME)
    }
    expect(landing({ grants: ['self', 'club_admin'], facilityLogFeature: true })?.redirect).toBe(BACKEND_HOME)
  })

  it('sends an administrator without a member side who does not coach to /backend', () => {
    expect(landing({ grants: ['self', 'club_admin'] })).toEqual({ redirect: BACKEND_HOME, notice: false })
    expect(landing({ grants: ['club_admin', 'coordinator'] })?.redirect).toBe(BACKEND_HOME)
  })

  it('sends a treasurer without a member side who does not coach to /backend (#245)', () => {
    expect(landing({ grants: ['self', 'treasurer'] })).toEqual({ redirect: BACKEND_HOME, notice: false })
    expect(landing({ grants: ['self', 'treasurer'], facilityLogFeature: true })?.redirect).toBe(BACKEND_HOME)
    expect(landing({ grants: ['self', 'treasurer'], memberSide: true })?.redirect).toBe(MEMBER_HOME)
    expect(landing({ grants: ['self', 'treasurer', 'coach'] })?.redirect).toBe(MEMBER_HOME)
  })

  it('sends an administrator who is a parent or a coach to /club', () => {
    expect(landing({ grants: ['self', 'club_admin', 'guardian'], memberSide: true })?.redirect).toBe(MEMBER_HOME)
    expect(landing({ grants: ['self', 'club_admin', 'coach'] })?.redirect).toBe(MEMBER_HOME)
  })

  it('keeps an unlinked account on /backend with the notice', () => {
    expect(landing({ linked: false })).toEqual({ redirect: BACKEND_HOME, notice: true })
  })

  it('keeps the platform answer for a linked user without people.self and for an explicit redirect', () => {
    expect(landing({ selfFeature: false })).toBeNull()
    expect(landing({ redirect: '/backend/people/persons' })).toBeNull()
    expect(landing({ redirect: '/club/messages/t-1', facilityLogFeature: true })).toBeNull()
    expect(landing({ redirect: undefined, linked: false, selfFeature: false })).toBeNull()
  })
})

describe('withNotice', () => {
  it('adds the not-linked notice parameter, never the platform flash', () => {
    expect(withNotice('/backend')).toBe('/backend?notice=person-not-linked')
  })
})

describe('hasNotLinkedNotice', () => {
  it('is true only for the not-linked notice parameter', () => {
    expect(hasNotLinkedNotice(new URLSearchParams('notice=person-not-linked'))).toBe(true)
    expect(hasNotLinkedNotice(new URLSearchParams('notice=other'))).toBe(false)
    expect(hasNotLinkedNotice(new URLSearchParams(''))).toBe(false)
    expect(hasNotLinkedNotice(null)).toBe(false)
  })
})

describe('consentAuthorIds', () => {
  const view = (regulations: string | null, image: string | null, trips: string | null) => ({
    regulations: { granted: true, at: '2026-10-01T08:00:00.000Z', byPersonId: regulations },
    image: { granted: false, at: null, byPersonId: image },
    trips: { granted: true, at: '2026-10-02T08:00:00.000Z', byPersonId: trips },
    medical: { granted: false, at: null, byPersonId: null },
  })

  it('lists each author once, in first-seen order, and skips consents never set', () => {
    expect(consentAuthorIds([view('kasia', null, 'admin'), view('admin', 'tomek', null)])).toEqual([
      'kasia',
      'admin',
      'tomek',
    ])
    expect(consentAuthorIds([])).toEqual([])
  })
})

describe('consentAuthorRole', () => {
  it('picks the most senior staff role, else staff', () => {
    expect(consentAuthorRole(['coach', 'club_admin'])).toBe('club_admin')
    expect(consentAuthorRole(['coach', 'coordinator'])).toBe('coordinator')
    expect(consentAuthorRole(['coach'])).toBe('coach')
    expect(consentAuthorRole([])).toBe('staff')
  })
})

describe('withConsentAuthors', () => {
  it('names a family author, labels an author outside the family by role, and leaves a consent never set empty', () => {
    const view = {
      regulations: { granted: true, at: '2026-10-01T08:00:00.000Z', byPersonId: 'kasia' },
      image: { granted: false, at: '2026-10-03T08:00:00.000Z', byPersonId: 'admin' },
      trips: { granted: false, at: null, byPersonId: null },
      medical: { granted: false, at: null, byPersonId: null },
    }
    const authors = {
      family: new Set(['kasia', 'ola']),
      names: new Map([['kasia', 'Kasia Nowak']]),
      roles: new Map([['admin', 'club_admin' as const]]),
    }
    expect(withConsentAuthors(view, authors)).toEqual({
      regulations: { ...view.regulations, byName: 'Kasia Nowak', byRole: null },
      image: { ...view.image, byName: null, byRole: 'club_admin' },
      trips: { ...view.trips, byName: null, byRole: null },
      medical: { ...view.medical, byName: null, byRole: null },
    })
  })

  it('has no name for an unresolvable family author and labels an outside author without a role as staff', () => {
    const view = {
      regulations: { granted: true, at: '2026-10-01T08:00:00.000Z', byPersonId: 'gone' },
      image: { granted: true, at: '2026-10-01T08:00:00.000Z', byPersonId: 'former-coach' },
      trips: { granted: false, at: null, byPersonId: null },
      medical: { granted: false, at: null, byPersonId: null },
    }
    const authors = { family: new Set(['gone']), names: new Map(), roles: new Map() }
    expect(withConsentAuthors(view, authors)).toMatchObject({
      regulations: { byName: null, byRole: null },
      image: { byName: null, byRole: 'staff' },
    })
  })
})

describe('publicPersonName', () => {
  it('shows the first name and the initial of the last name', () => {
    expect(publicPersonName('Anna', 'Kowalska')).toBe('Anna K.')
    expect(publicPersonName('  Jan  Paweł ', ' łukasiewicz')).toBe('Jan Paweł Ł.')
  })

  it('shows the first name alone without a last name and nothing without a first name', () => {
    expect(publicPersonName('Anna', '  ')).toBe('Anna')
    expect(publicPersonName('  ', 'Kowalska')).toBeNull()
  })
})
