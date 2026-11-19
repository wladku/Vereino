import { describe, expect, it } from '@jest/globals'
import { ageOn } from '@vereino/core'
import {
  PERSON_FILTER_ID_LIMIT,
  PERSON_FILTER_ROLES,
  PERSON_LIST_FILTER_KEYS,
  PERSON_LIST_VIEWS,
  attentionBirthDates,
  birthDateRange,
  intersectBirthDateRanges,
  canRemoveLastFilter,
  intersectIdSets,
  isPersonListFiltered,
  listDisplayName,
  personListApiParams,
  personListPlan,
  personListUrlParams,
  personRoleBadges,
  planNeedsMemberships,
  PERSON_ATTENTION_FILTERS,
  readPersonListUrl,
  withoutLastFilter,
  yearsBefore,
  type PersonListUrlState,
} from '../person-list-filters'

const today = '2026-11-04'

function inRange(birthDate: string, range: ReturnType<typeof birthDateRange>): boolean {
  if (!range) return true
  if (range.onOrBefore !== null && birthDate > range.onOrBefore) return false
  if (range.after !== null && birthDate <= range.after) return false
  return true
}

describe('constants', () => {
  it('lists the perspectives, roles and URL filters of B-09', () => {
    expect(PERSON_LIST_VIEWS).toEqual(['all', 'staff', 'children', 'no_account', 'former'])
    expect(PERSON_FILTER_ROLES).toEqual([
      'club_admin',
      'coordinator',
      'coach',
      'facility_operator',
      'guardian',
      'participant',
    ])
    expect(PERSON_LIST_FILTER_KEYS).toEqual([
      'sectionId',
      'groupId',
      'role',
      'hasAccount',
      'ageFrom',
      'ageTo',
      'attention',
    ])
    expect(PERSON_FILTER_ID_LIMIT).toBe(10_000)
  })
})

describe('yearsBefore', () => {
  it('keeps the month and day', () => {
    expect(yearsBefore(today, 18)).toBe('2008-11-04')
    expect(yearsBefore('2026-01-05', 5)).toBe('2021-01-05')
  })

  it('maps 29 February to 28 February in a common year and keeps it in a leap year', () => {
    expect(yearsBefore('2028-02-29', 1)).toBe('2027-02-28')
    expect(yearsBefore('2028-02-29', 4)).toBe('2024-02-29')
  })

  it('rejects a malformed date', () => {
    expect(() => yearsBefore('2026-13-01', 1)).toThrow()
  })
})

describe('birthDateRange', () => {
  it('is null without any bound', () => {
    expect(birthDateRange({}, today)).toBeNull()
    expect(birthDateRange({ minorsOnly: false }, today)).toBeNull()
  })

  it('translates an age range to birth-date bounds', () => {
    expect(birthDateRange({ ageFrom: 13, ageTo: 17 }, today)).toEqual({ onOrBefore: '2013-11-04', after: '2008-11-04' })
    expect(birthDateRange({ ageFrom: 18 }, today)).toEqual({ onOrBefore: '2008-11-04', after: null })
    expect(birthDateRange({ ageTo: 12 }, today)).toEqual({ onOrBefore: null, after: '2013-11-04' })
  })

  it('narrows to minors and keeps the lower of two upper ages', () => {
    expect(birthDateRange({ minorsOnly: true }, today)).toEqual({ onOrBefore: null, after: '2008-11-04' })
    expect(birthDateRange({ minorsOnly: true, ageTo: 30 }, today)).toEqual({ onOrBefore: null, after: '2008-11-04' })
    expect(birthDateRange({ minorsOnly: true, ageTo: 9 }, today)).toEqual({ onOrBefore: null, after: '2016-11-04' })
  })

  it('agrees with ageOn on the day of and the day around a birthday', () => {
    const range = birthDateRange({ ageFrom: 13, ageTo: 17 }, today)
    for (const birthDate of ['2013-11-04', '2013-11-05', '2008-11-04', '2008-11-05', '2010-06-15', '2001-01-01']) {
      const age = ageOn(birthDate, today)
      expect(inRange(birthDate, range)).toBe(age >= 13 && age <= 17)
    }
  })

  it('agrees with ageOn for someone born on 29 February when today is 28 February or 1 March', () => {
    for (const day of ['2027-02-28', '2027-03-01']) {
      const range = birthDateRange({ ageFrom: 3 }, day)
      expect(inRange('2024-02-29', range)).toBe(ageOn('2024-02-29', day) >= 3)
    }
    const leapDay = birthDateRange({ ageTo: 2 }, '2028-02-29')
    expect(inRange('2025-02-28', leapDay)).toBe(ageOn('2025-02-28', '2028-02-29') <= 2)
    expect(inRange('2025-03-01', leapDay)).toBe(ageOn('2025-03-01', '2028-02-29') <= 2)
  })
})

describe('personListPlan', () => {
  it('is open for the plain list', () => {
    expect(personListPlan({}, today)).toEqual({
      birthDates: null,
      accountConditions: [],
      staff: false,
      role: null,
      sectionId: null,
      groupId: null,
      former: 'exclude',
      missingConsents: false,
      withoutEmail: false,
    })
  })

  it('leaves former persons out except in their perspective and a name search of the plain list (#306)', () => {
    expect(personListPlan({ view: 'former' }, today).former).toBe('only')
    expect(personListPlan({ view: 'former', search: 'Kow' }, today).former).toBe('only')
    expect(personListPlan({ search: 'Kow' }, today).former).toBe('any')
    expect(personListPlan({ search: '  ' }, today).former).toBe('exclude')
    expect(personListPlan({ view: 'staff', search: 'Kow' }, today).former).toBe('exclude')
  })

  it('maps the perspectives', () => {
    expect(personListPlan({ view: 'all' }, today).staff).toBe(false)
    expect(personListPlan({ view: 'staff' }, today).staff).toBe(true)
    expect(personListPlan({ view: 'children' }, today).birthDates).toEqual({ onOrBefore: null, after: '2008-11-04' })
    expect(personListPlan({ view: 'no_account' }, today).accountConditions).toEqual([false])
  })

  it('combines the perspective with the filters by AND', () => {
    expect(personListPlan({ view: 'no_account', hasAccount: 'false' }, today).accountConditions).toEqual([false])
    expect(personListPlan({ view: 'no_account', hasAccount: 'true' }, today).accountConditions).toEqual([true, false])
    expect(personListPlan({ hasAccount: 'true' }, today).accountConditions).toEqual([true])
    const plan = personListPlan(
      { view: 'children', role: 'participant', sectionId: 's', groupId: 'g', ageFrom: 6 },
      today,
    )
    expect(plan).toEqual({
      birthDates: { onOrBefore: '2020-11-04', after: '2008-11-04' },
      accountConditions: [],
      staff: false,
      role: 'participant',
      sectionId: 's',
      groupId: 'g',
      former: 'exclude',
      missingConsents: false,
      withoutEmail: false,
    })
  })
})

describe('planNeedsMemberships', () => {
  it('is true for the section, group and participant predicates only', () => {
    expect(planNeedsMemberships(personListPlan({}, today))).toBe(false)
    expect(planNeedsMemberships(personListPlan({ view: 'staff', role: 'coach' }, today))).toBe(false)
    expect(planNeedsMemberships(personListPlan({ sectionId: 's' }, today))).toBe(true)
    expect(planNeedsMemberships(personListPlan({ groupId: 'g' }, today))).toBe(true)
    expect(planNeedsMemberships(personListPlan({ role: 'participant' }, today))).toBe(true)
  })

  it('is true for the missing-consents filter, which reads the participants (#309)', () => {
    const plan = personListPlan({ attention: 'missing_consents' }, today)
    expect(plan.missingConsents).toBe(true)
    expect(planNeedsMemberships(plan)).toBe(true)
    expect(PERSON_ATTENTION_FILTERS).toEqual([
      'missing_consents',
      'account_age',
      'turns_18_soon',
      'adult_without_contact',
    ])
  })

  it('is false for the L8 values, which read only the person (#310)', () => {
    expect(planNeedsMemberships(personListPlan({ attention: 'account_age' }, today))).toBe(false)
    expect(planNeedsMemberships(personListPlan({ attention: 'turns_18_soon' }, today))).toBe(false)
    expect(planNeedsMemberships(personListPlan({ attention: 'adult_without_contact' }, today))).toBe(false)
  })
})

describe('intersectBirthDateRanges', () => {
  it('keeps one side when the other is absent', () => {
    const range = { onOrBefore: '2010-01-01', after: null }
    expect(intersectBirthDateRanges(null, null)).toBeNull()
    expect(intersectBirthDateRanges(range, null)).toBe(range)
    expect(intersectBirthDateRanges(null, range)).toBe(range)
  })

  it('takes the earlier upper and the later lower bound', () => {
    expect(
      intersectBirthDateRanges(
        { onOrBefore: '2010-01-01', after: '2000-01-01' },
        { onOrBefore: '2012-01-01', after: '2005-01-01' },
      ),
    ).toEqual({ onOrBefore: '2010-01-01', after: '2005-01-01' })
    expect(
      intersectBirthDateRanges(
        { onOrBefore: '2012-01-01', after: '2005-01-01' },
        { onOrBefore: '2010-01-01', after: '2000-01-01' },
      ),
    ).toEqual({ onOrBefore: '2010-01-01', after: '2005-01-01' })
    expect(
      intersectBirthDateRanges({ onOrBefore: null, after: null }, { onOrBefore: '2010-01-01', after: '2000-01-01' }),
    ).toEqual({
      onOrBefore: '2010-01-01',
      after: '2000-01-01',
    })
    expect(
      intersectBirthDateRanges({ onOrBefore: '2010-01-01', after: '2000-01-01' }, { onOrBefore: null, after: null }),
    ).toEqual({
      onOrBefore: '2010-01-01',
      after: '2000-01-01',
    })
  })
})

describe('attentionBirthDates (#310)', () => {
  it('has nothing for no value and for missing consents', () => {
    expect(attentionBirthDates(undefined, today, 16)).toBeNull()
    expect(attentionBirthDates('missing_consents', today, 16)).toBeNull()
  })

  it('lists minors without an account at the club account age', () => {
    expect(attentionBirthDates('account_age', today, 16)).toEqual({
      birthDates: { onOrBefore: '2010-11-04', after: '2008-11-04' },
      withoutAccount: true,
    })
  })

  it('lists persons whose 18th birthday is within 30 days', () => {
    const range = attentionBirthDates('turns_18_soon', today, 16)
    expect(range).toEqual({ birthDates: { onOrBefore: '2008-12-04', after: '2008-11-04' }, withoutAccount: false })
    // Born 2008-11-05: 18 on 2026-11-05 (tomorrow) — in; born 2008-11-04: 18 today — out.
    expect('2008-11-05' > (range?.birthDates.after as string)).toBe(true)
    expect('2008-11-04' > (range?.birthDates.after as string)).toBe(false)
  })

  it('lists adults without an account', () => {
    expect(attentionBirthDates('adult_without_contact', today, 16)).toEqual({
      birthDates: { onOrBefore: '2008-11-04', after: null },
      withoutAccount: true,
    })
  })

  it('narrows the plan: account, age bounds and e-mail', () => {
    const plan = personListPlan({ attention: 'adult_without_contact', ageTo: 30, hasAccount: 'false' }, today)
    expect(plan.accountConditions).toEqual([false])
    expect(plan.withoutEmail).toBe(true)
    expect(plan.birthDates).toEqual({ onOrBefore: '2008-11-04', after: '1995-11-04' })
    expect(personListPlan({ attention: 'account_age' }, today, 13).birthDates).toEqual({
      onOrBefore: '2013-11-04',
      after: '2008-11-04',
    })
    expect(personListPlan({ attention: 'account_age' }, today).birthDates?.onOrBefore).toBe('2010-11-04')
    expect(personListPlan({ attention: 'turns_18_soon' }, today).accountConditions).toEqual([])
  })
})

describe('intersectIdSets', () => {
  it('does not restrict without a set', () => {
    expect(intersectIdSets([])).toBeNull()
    expect(intersectIdSets([null, null])).toBeNull()
  })

  it('intersects the given sets and ignores null', () => {
    expect(intersectIdSets([new Set(['a', 'b']), null])).toEqual(new Set(['a', 'b']))
    expect(intersectIdSets([new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']), new Set(['c', 'b'])])).toEqual(
      new Set(['b', 'c']),
    )
    expect(intersectIdSets([new Set(['a']), new Set<string>()])).toEqual(new Set())
  })

  it('does not alias its input', () => {
    const input = new Set(['a'])
    const result = intersectIdSets([input])
    result?.add('b')
    expect(input).toEqual(new Set(['a']))
  })
})

describe('personRoleBadges', () => {
  it('orders the assigned roles and adds the guardian', () => {
    expect(personRoleBadges({ roles: ['coach', 'club_admin'], hasWards: true })).toEqual([
      'club_admin',
      'coach',
      'guardian',
    ])
    expect(personRoleBadges({ roles: [], hasWards: false })).toEqual([])
  })

  it('shows a coach for a coach or assistant membership, not for a participant one', () => {
    expect(personRoleBadges({ roles: [], hasWards: false, membershipRoles: ['assistant'] })).toEqual(['coach'])
    expect(personRoleBadges({ roles: ['coordinator'], hasWards: false, membershipRoles: ['coach'] })).toEqual([
      'coordinator',
      'coach',
    ])
    expect(personRoleBadges({ roles: [], hasWards: false, membershipRoles: ['participant'] })).toEqual([])
  })

  it('shows the facility attendant after the coach (#126)', () => {
    expect(personRoleBadges({ roles: ['facility_operator', 'coach'], hasWards: true })).toEqual([
      'coach',
      'facility_operator',
      'guardian',
    ])
  })

  it('ignores an unknown role', () => {
    expect(personRoleBadges({ roles: ['treasurer'], hasWards: false })).toEqual([])
  })
})

describe('URL state', () => {
  const read = (query: string) => {
    const params = new URLSearchParams(query)
    return readPersonListUrl((key) => params.get(key))
  }

  it('reads the defaults from an empty query', () => {
    expect(read('')).toEqual({ view: 'all', search: '', page: 1, filters: {} })
  })

  it('reads the perspective, search, page and filters', () => {
    expect(read('view=children&search=Jan%20Kow&page=3&sectionId=s1&hasAccount=false&ageFrom=6&other=x')).toEqual({
      view: 'children',
      search: 'Jan Kow',
      page: 3,
      filters: { sectionId: 's1', hasAccount: 'false', ageFrom: '6' },
    })
  })

  it('falls back on an unknown perspective, a bad page and blank filters', () => {
    expect(read('view=everyone&page=abc&groupId=%20%20')).toEqual({ view: 'all', search: '', page: 1, filters: {} })
    expect(read('page=0').page).toBe(1)
    expect(read('page=2.5').page).toBe(1)
  })

  it('writes only what differs from the defaults and round-trips', () => {
    const state: PersonListUrlState = {
      view: 'no_account',
      search: 'Kow',
      page: 2,
      filters: { role: 'coach', ageTo: '17' },
    }
    const params = personListUrlParams(state)
    expect(params).toEqual({ view: 'no_account', search: 'Kow', role: 'coach', ageTo: '17', page: '2' })
    expect(read(new URLSearchParams(params).toString())).toEqual(state)
    expect(personListUrlParams({ view: 'all', search: '  ', page: 1, filters: {} })).toEqual({})
  })

  it('builds the API query without the page and with a search of two characters or more', () => {
    const base: PersonListUrlState = { view: 'staff', search: ' Jan ', page: 4, filters: { groupId: 'g1' } }
    expect(personListApiParams(base)).toEqual({ view: 'staff', search: 'Jan', groupId: 'g1' })
    expect(personListApiParams({ ...base, search: 'J' })).toEqual({ view: 'staff', groupId: 'g1' })
    expect(personListApiParams({ ...base, search: '' })).toEqual({ view: 'staff', groupId: 'g1' })
  })

  it('tells whether anything narrows the list', () => {
    const plain: PersonListUrlState = { view: 'all', search: '', page: 3, filters: {} }
    expect(isPersonListFiltered(plain)).toBe(false)
    expect(isPersonListFiltered({ ...plain, view: 'children' })).toBe(true)
    expect(isPersonListFiltered({ ...plain, search: 'x' })).toBe(true)
    expect(isPersonListFiltered({ ...plain, search: '  ' })).toBe(false)
    expect(isPersonListFiltered({ ...plain, filters: { role: 'coach' } })).toBe(true)
  })
})

describe('withoutLastFilter and canRemoveLastFilter', () => {
  const base: PersonListUrlState = { view: 'children', search: 'Jan', page: 3, filters: {} }

  it('removes the last set filter first, keeping the perspective and the search', () => {
    expect(withoutLastFilter({ ...base, filters: { sectionId: 's', ageTo: '17' } })).toEqual({
      ...base,
      page: 1,
      filters: { sectionId: 's' },
    })
  })

  it('then resets the perspective', () => {
    expect(withoutLastFilter(base)).toEqual({ ...base, view: 'all', page: 1 })
  })

  it('tells whether there is anything to remove', () => {
    expect(canRemoveLastFilter(base)).toBe(true)
    expect(canRemoveLastFilter({ ...base, view: 'all' })).toBe(false)
    expect(canRemoveLastFilter({ ...base, view: 'all', filters: { role: 'coach' } })).toBe(true)
  })
})

describe('listDisplayName', () => {
  it('reads "Last First" and skips a missing part', () => {
    expect(listDisplayName({ firstName: 'Jan', lastName: 'Kowalski' })).toBe('Kowalski Jan')
    expect(listDisplayName({ firstName: null, lastName: 'Kowalski' })).toBe('Kowalski')
    expect(listDisplayName({ firstName: 'Jan', lastName: null })).toBe('Jan')
    expect(listDisplayName({ firstName: null, lastName: null })).toBe('')
  })
})
