import { describe, expect, it } from '@jest/globals'
import {
  CAME_OF_AGE_CARD_DAYS,
  LIFE_CYCLE_STEPS,
  TURNS_18_NOTICE_DAYS,
  accountAgeKey,
  accountAgeKeysUpTo,
  accountAgeReached,
  cameOfAgeKey,
  carriedOverConsents,
  eighteenthBirthday,
  guardianshipEndDay,
  guardianshipsEndingAt18,
  knownBirthDate,
  ownNotice,
  turns18Soon,
  turns18SoonKey,
  wardNotices,
  type LifeCycleGuardianship,
} from '../life-cycle-rules'

const PERSON = '11111111-1111-4111-8111-111111111111'
const KASIA = '22222222-2222-4222-8222-222222222222'
const ANETA = '33333333-3333-4333-8333-333333333333'

function link(
  id: string,
  validFrom: string,
  validTo: string | null = null,
  extra: Partial<LifeCycleGuardianship> = {},
) {
  return { id, guardianPersonId: KASIA, validFrom, validTo, consents: {}, ...extra }
}

describe('constants', () => {
  it('announces 30 days ahead and runs steps 1–4 (step 5 joins with phase L6)', () => {
    expect(TURNS_18_NOTICE_DAYS).toBe(30)
    expect(CAME_OF_AGE_CARD_DAYS).toBe(30)
    expect(LIFE_CYCLE_STEPS).toEqual(['turns_18_soon', 'came_of_age', 'account_age', 'departed_accounts'])
  })
})

describe('knownBirthDate', () => {
  it('reads a calendar date and refuses an unknown or malformed one', () => {
    expect(knownBirthDate('2008-12-15')).toBe('2008-12-15')
    expect(knownBirthDate('2008-12-15T00:00:00.000Z')).toBe('2008-12-15')
    expect(knownBirthDate(null)).toBeNull()
    expect(knownBirthDate(undefined)).toBeNull()
    expect(knownBirthDate('')).toBeNull()
    expect(knownBirthDate('2008-13-40')).toBeNull()
  })
})

describe('eighteenthBirthday and guardianshipEndDay', () => {
  it('is the same day 18 years later; the guardianship ends the day before', () => {
    expect(eighteenthBirthday('2008-12-15')).toBe('2026-12-15')
    expect(guardianshipEndDay('2008-12-15')).toBe('2026-12-14')
    expect(guardianshipEndDay('2008-01-01')).toBe('2025-12-31')
  })

  it('moves 29 February to 1 March of a common year, as ageOn counts it', () => {
    expect(eighteenthBirthday('2008-02-29')).toBe('2026-03-01')
    expect(guardianshipEndDay('2008-02-29')).toBe('2026-02-28')
    expect(eighteenthBirthday('2006-02-28')).toBe('2024-02-28')
    expect(eighteenthBirthday('2004-02-29')).toBe('2022-03-01')
    expect(eighteenthBirthday('2002-02-28')).toBe('2020-02-28')
  })
})

describe('turns18Soon', () => {
  it('is true when the birthday is after today and at most 30 days later', () => {
    // 17 years and 335 days old on 2026-11-15: the birthday is 30 days later.
    expect(turns18Soon('2008-12-15', '2026-11-15')).toBe(true)
    expect(turns18Soon('2008-12-15', '2026-11-14')).toBe(false)
    expect(turns18Soon('2008-12-15', '2026-12-14')).toBe(true)
    expect(turns18Soon('2008-12-15', '2026-12-15')).toBe(false)
    expect(turns18Soon('2008-12-15', '2027-01-01')).toBe(false)
  })
})

describe('guardianshipsEndingAt18', () => {
  const birth = '2008-12-15'

  it('ends nothing before the 18th birthday', () => {
    expect(guardianshipsEndingAt18(birth, [link('a', '2010-01-01')], '2026-12-14')).toEqual([])
  })

  it('ends every guardianship active today that started before the birthday', () => {
    const rows = [
      link('open', '2010-01-01'),
      link('dated', '2015-01-01', '2027-06-30'),
      link('ended', '2010-01-01', '2020-01-01'),
      link('after', '2026-12-15'),
      link('future', '2026-12-20'),
    ]
    expect(guardianshipsEndingAt18(birth, rows, '2026-12-15').map((row) => row.id)).toEqual(['open', 'dated'])
  })

  it('catches up a missed day and keeps a guardianship created on or after the birthday (Q-L03)', () => {
    const rows = [link('missed', '2010-01-01'), link('deliberate', '2027-01-05')]
    expect(guardianshipsEndingAt18(birth, rows, '2027-01-10').map((row) => row.id)).toEqual(['missed'])
  })
})

describe('carriedOverConsents', () => {
  it('copies the most recent decision per kind with its author and date', () => {
    const first = {
      regulations: { granted: true, at: '2025-09-02T08:00:00.000Z', by_person_id: KASIA },
      image: { granted: true, at: '2025-09-02T08:00:00.000Z', by_person_id: KASIA },
    }
    const second = {
      image: { granted: false, at: '2026-03-01T08:00:00.000Z', by_person_id: ANETA },
      trips: { granted: true, at: '2024-01-01T08:00:00.000Z', by_person_id: null },
    }
    const older = { regulations: { granted: false, at: '2020-01-01T00:00:00.000Z', by_person_id: ANETA } }
    expect(carriedOverConsents({}, [first, second, older])).toEqual({
      consents: {
        regulations: { granted: true, at: '2025-09-02T08:00:00.000Z', by_person_id: KASIA },
        image: { granted: false, at: '2026-03-01T08:00:00.000Z', by_person_id: ANETA },
        trips: { granted: true, at: '2024-01-01T08:00:00.000Z', by_person_id: null },
      },
      copied: ['regulations', 'image', 'trips'],
    })
  })

  it("keeps the adult's own decision and copies nothing nobody decided", () => {
    const own = { image: { granted: false, at: '2026-12-16T08:00:00.000Z', by_person_id: PERSON } }
    const ending = [{ image: { granted: true, at: '2025-09-02T08:00:00.000Z', by_person_id: KASIA } }]
    expect(carriedOverConsents(own, ending)).toEqual({ consents: own, copied: [] })
    expect(carriedOverConsents({}, [])).toEqual({ consents: {}, copied: [] })
  })
})

describe('accountAgeReached', () => {
  const today = '2026-11-19'

  it('is true for a minor without an account at or above the threshold', () => {
    expect(accountAgeReached({ birthDate: '2010-11-19', threshold: 16, hasAccount: false, today })).toBe(true)
    expect(accountAgeReached({ birthDate: '2010-11-20', threshold: 16, hasAccount: false, today })).toBe(false)
  })

  it('is false with an account, and for an adult', () => {
    expect(accountAgeReached({ birthDate: '2010-11-19', threshold: 16, hasAccount: true, today })).toBe(false)
    expect(accountAgeReached({ birthDate: '2008-11-19', threshold: 16, hasAccount: false, today })).toBe(false)
  })
})

describe('dispatch keys', () => {
  it('names the person (and the threshold)', () => {
    expect(turns18SoonKey(PERSON)).toBe(`people:turns-18-soon:${PERSON}`)
    expect(cameOfAgeKey(PERSON)).toBe(`people:came-of-age:${PERSON}`)
    expect(accountAgeKey(PERSON, 16)).toBe(`people:account-age:${PERSON}:16`)
  })

  it('lists one account-age key per threshold up to the age, at most 17', () => {
    expect(accountAgeKeysUpTo(PERSON, 2)).toEqual([
      accountAgeKey(PERSON, 0),
      accountAgeKey(PERSON, 1),
      accountAgeKey(PERSON, 2),
    ])
    expect(accountAgeKeysUpTo(PERSON, 30)).toHaveLength(18)
    expect(accountAgeKeysUpTo(PERSON, -1)).toEqual([])
  })
})

describe('wardNotices', () => {
  it('shows nothing without a birth date', () => {
    expect(wardNotices({ birthDate: null, hasAccount: false, threshold: 16, today: '2026-11-19' })).toEqual([])
  })

  it('says the ward may have an own account and when the 18th birthday comes', () => {
    expect(wardNotices({ birthDate: '2008-12-15', hasAccount: false, threshold: 16, today: '2026-11-19' })).toEqual([
      { kind: 'may_have_account' },
      { kind: 'turns_18', on: '2026-12-15' },
    ])
  })

  it('leaves out the account line with an account or below the threshold', () => {
    expect(wardNotices({ birthDate: '2008-12-15', hasAccount: true, threshold: 16, today: '2026-11-19' })).toEqual([
      { kind: 'turns_18', on: '2026-12-15' },
    ])
    expect(wardNotices({ birthDate: '2012-01-01', hasAccount: false, threshold: 16, today: '2026-11-19' })).toEqual([])
  })
})

describe('ownNotice', () => {
  it('is null without a birth date, long before and long after the birthday', () => {
    expect(ownNotice(null, '2026-11-19')).toBeNull()
    expect(ownNotice('2008-12-15', '2026-11-01')).toBeNull()
    expect(ownNotice('2008-12-15', '2027-01-14')).toBeNull()
  })

  it('announces the birthday in the 30 days before it', () => {
    expect(ownNotice('2008-12-15', '2026-11-19')).toEqual({ kind: 'turns_18', on: '2026-12-15' })
  })

  it('shows the came-of-age card from the birthday for 30 days', () => {
    expect(ownNotice('2008-12-15', '2026-12-15')).toEqual({ kind: 'came_of_age', on: '2026-12-15' })
    expect(ownNotice('2008-12-15', '2027-01-13')).toEqual({ kind: 'came_of_age', on: '2026-12-15' })
  })
})
