// TEST-I03 of the event photos spec (#871): the image consent rules — BR-I02 (veto), BR-I03 (adult, carry-over),
// BR-I04 (staff grants do not count), BR-I05 (who may change it), BR-I06 (undo keeps a withdrawal).
import { describe, expect, it } from '@jest/globals'
import {
  CONSENT_NOTE_MAX,
  CONSENT_NOTE_MIN,
  adultImagePublishable,
  builtInWordingKey,
  carriedOverImage,
  consentDecisionRole,
  imageChangeProblem,
  imagePublishable,
  minorImagePublishable,
} from '../image-consent'
import { changedConsents, parseStoredConsents, restoreConsentsKeepingWithdrawals } from '../people-rules'

const KASIA = '22222222-2222-4222-8222-222222222222'
const TOMEK = '44444444-4444-4444-8444-444444444444'
const ADMIN = '33333333-3333-4333-8333-333333333333'
const JAS = '11111111-1111-4111-8111-111111111111'

const at = (day: string) => `2026-11-${day}T10:00:00.000Z`
const grant = (by: string | null, day = '20') => ({ granted: true, at: at(day), by_person_id: by })
const withdrawal = (by: string | null, day = '21') => ({ granted: false, at: at(day), by_person_id: by })
const link = (guardianPersonId: string, image?: ReturnType<typeof grant>) => ({
  guardianPersonId,
  consents: image ? { image } : {},
})

describe('minorImagePublishable (BR-I02, BR-I04)', () => {
  it('holds with one guardian grant of their own row and no withdrawal', () => {
    expect(minorImagePublishable([link(KASIA, grant(KASIA)), link(TOMEK)])).toBe(true)
  })

  it('is vetoed by any guardian withdrawal, whatever the order', () => {
    expect(minorImagePublishable([link(KASIA, grant(KASIA, '25')), link(TOMEK, withdrawal(TOMEK, '21'))])).toBe(false)
    expect(minorImagePublishable([link(TOMEK, withdrawal(ADMIN)), link(KASIA, grant(KASIA))])).toBe(false)
  })

  it('ignores grants recorded by staff or by the other guardian, and fails without guardianships', () => {
    expect(minorImagePublishable([link(KASIA, grant(ADMIN))])).toBe(false)
    expect(minorImagePublishable([link(KASIA, grant(TOMEK))])).toBe(false)
    expect(minorImagePublishable([link(KASIA, grant(null))])).toBe(false)
    expect(minorImagePublishable([])).toBe(false)
  })
})

describe('adultImagePublishable (BR-I03, BR-I04)', () => {
  it('holds for the adult own grant or a carried-over grant', () => {
    expect(adultImagePublishable(JAS, { image: grant(JAS) })).toBe(true)
    expect(adultImagePublishable(JAS, { image: { ...grant(KASIA), via: 'carry_over' } })).toBe(true)
  })

  it('fails for a staff grant, a withdrawal or no decision', () => {
    expect(adultImagePublishable(JAS, { image: grant(ADMIN) })).toBe(false)
    expect(adultImagePublishable(JAS, { image: withdrawal(JAS) })).toBe(false)
    expect(adultImagePublishable(JAS, {})).toBe(false)
  })
})

describe('imagePublishable', () => {
  it('reads the adult rule for an adult and the minor rule otherwise', () => {
    const guardianships = [link(KASIA, grant(KASIA))]
    expect(imagePublishable({ personId: JAS, adult: true, own: {}, guardianships })).toBe(false)
    expect(imagePublishable({ personId: JAS, adult: false, own: {}, guardianships })).toBe(true)
  })
})

describe('carriedOverImage (BR-I03 at 18)', () => {
  it('carries the latest guardian grant over when BR-I02 held', () => {
    expect(carriedOverImage([link(KASIA, grant(KASIA, '10')), link(TOMEK, grant(TOMEK, '15'))])).toEqual({
      ...grant(TOMEK, '15'),
      via: 'carry_over',
    })
    expect(carriedOverImage([link(TOMEK, grant(TOMEK, '15')), link(KASIA, grant(KASIA, '10'))])).toEqual({
      ...grant(TOMEK, '15'),
      via: 'carry_over',
    })
  })

  it('skips rows without a decision or with a staff grant when carrying a grant over', () => {
    expect(carriedOverImage([link(KASIA, grant(KASIA, '10')), link(TOMEK), link(ADMIN, grant(KASIA, '30'))])).toEqual({
      ...grant(KASIA, '10'),
      via: 'carry_over',
    })
  })

  it('carries the veto: the latest withdrawal, even when a grant is later', () => {
    expect(
      carriedOverImage([
        link(KASIA, grant(KASIA, '25')),
        link(TOMEK, withdrawal(TOMEK, '21')),
        link(ADMIN, withdrawal(ADMIN, '22')),
      ]),
    ).toEqual(withdrawal(ADMIN, '22'))
  })

  it('copies a staff grant as it is (it still does not count) and nothing when nobody decided', () => {
    expect(carriedOverImage([link(KASIA, grant(ADMIN))])).toEqual(grant(ADMIN))
    expect(carriedOverImage([link(KASIA)])).toBeNull()
  })
})

describe('imageChangeProblem (BR-I05)', () => {
  const base = { actingRole: 'guardian' as const, actorPersonId: KASIA, owner: KASIA, note: null }

  it('lets the owner grant and withdraw', () => {
    expect(imageChangeProblem({ ...base, granted: true })).toBeNull()
    expect(imageChangeProblem({ ...base, granted: false })).toBeNull()
    expect(imageChangeProblem({ ...base, actingRole: 'club_admin', granted: true })).toBeNull()
  })

  it('refuses the other guardian on any change', () => {
    expect(imageChangeProblem({ ...base, owner: TOMEK, granted: true })).toBe('scope_denied')
    expect(imageChangeProblem({ ...base, owner: TOMEK, granted: false })).toBe('scope_denied')
  })

  it('refuses a staff grant and a staff withdrawal without a note', () => {
    const staff = { ...base, actingRole: 'club_admin' as const, actorPersonId: ADMIN }
    expect(imageChangeProblem({ ...staff, granted: true, note: 'asked by phone' })).toBe('image_consent_subject_only')
    expect(imageChangeProblem({ ...staff, granted: false })).toBe('consent_note_required')
    expect(imageChangeProblem({ ...staff, granted: false, note: '  ' })).toBe('consent_note_required')
    expect(imageChangeProblem({ ...staff, granted: false, note: 'asked by phone' })).toBeNull()
    expect(imageChangeProblem({ ...staff, actorPersonId: null, granted: true })).toBe('image_consent_subject_only')
  })
})

describe('consentDecisionRole', () => {
  it('names the owner as guardian or self, and anyone else as the club administrator', () => {
    expect(consentDecisionRole({ guardianship: true, actorPersonId: KASIA, owner: KASIA })).toBe('guardian')
    expect(consentDecisionRole({ guardianship: false, actorPersonId: JAS, owner: JAS })).toBe('self')
    expect(consentDecisionRole({ guardianship: true, actorPersonId: ADMIN, owner: KASIA })).toBe('club_admin')
    expect(consentDecisionRole({ guardianship: false, actorPersonId: null, owner: JAS })).toBe('club_admin')
  })
})

describe('builtInWordingKey and note bounds', () => {
  it('has a full wording for image and the label for the other kinds', () => {
    expect(builtInWordingKey('image')).toBe('people.consents.image.wording')
    expect(builtInWordingKey('trips')).toBe('people.guardianships.consents.trips')
    expect([CONSENT_NOTE_MIN, CONSENT_NOTE_MAX]).toEqual([2, 200])
  })
})

describe('restoreConsentsKeepingWithdrawals (BR-I06)', () => {
  it('restores the snapshot but keeps a current image withdrawal', () => {
    const current = { image: withdrawal(TOMEK), trips: grant(KASIA) }
    expect(restoreConsentsKeepingWithdrawals(current, { image: grant(KASIA, '19') })).toEqual({
      image: withdrawal(TOMEK),
    })
    expect(restoreConsentsKeepingWithdrawals(current, {})).toEqual({ image: withdrawal(TOMEK) })
  })

  it('restores the snapshot as it is otherwise', () => {
    const snapshot = { image: withdrawal(KASIA, '19') }
    expect(restoreConsentsKeepingWithdrawals({ image: withdrawal(TOMEK) }, snapshot)).toBe(snapshot)
    expect(restoreConsentsKeepingWithdrawals({ image: grant(KASIA) }, {})).toEqual({})
    expect(restoreConsentsKeepingWithdrawals({}, { image: grant(KASIA) })).toEqual({ image: grant(KASIA) })
  })
})

describe('changedConsents', () => {
  it('lists the kinds whose decision changed with the state after', () => {
    expect(
      changedConsents(
        { image: grant(KASIA), trips: grant(KASIA), regulations: grant(KASIA) },
        { image: withdrawal(KASIA), trips: grant(TOMEK), medical: grant(KASIA) },
      ),
    ).toEqual([
      { kind: 'regulations', granted: false },
      { kind: 'image', granted: false },
      { kind: 'medical', granted: true },
    ])
  })
})

describe('parseStoredConsents keeps the carry-over mark', () => {
  it('keeps via carry_over and drops any other via', () => {
    expect(parseStoredConsents({ image: { ...grant(KASIA), via: 'carry_over' } })).toEqual({
      image: { ...grant(KASIA), via: 'carry_over' },
    })
    expect(parseStoredConsents({ image: { ...grant(KASIA), via: 'staff' } })).toEqual({ image: grant(KASIA) })
  })
})
