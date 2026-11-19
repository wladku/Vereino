import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'
import {
  AGE_CATEGORY_DICTIONARY_KEY,
  COACHING_ROLES,
  GROUP_AGE_MAX,
  GROUP_AGE_MIN,
  GROUP_KINDS,
  MEMBERSHIP_ROLES,
  PZPN_AGE_CATEGORIES,
  ageRangeInverted,
  disallowedTeamFields,
  parseAgeInput,
  firstOverlapping,
  groupNameKey,
  isCoachingRole,
  matchGroupNames,
  needsMatchGuard,
  periodStatus,
  rosterOrder,
  ROSTER_ROLE_ORDER,
  ROSTER_VIEWS,
  endRefused,
  mayRemoveMembership,
  membershipActions,
  moveDateBounds,
  MOVE_MANY_LIMIT,
  MOVE_OUTCOMES,
  fitsAgeRange,
  moveManyProblem,
  moveOutcome,
  planMove,
  rosterRoleOrder,
  rosterRoleRankSql,
  rosterRoleRank,
  rosterViewBounds,
  seasonDatesInverted,
} from '../groups-rules'

describe('group kinds and membership roles', () => {
  it('declares both kinds and the three roles, of which coach and assistant lead the group', () => {
    expect(GROUP_KINDS).toEqual(['team', 'class_group'])
    expect(MEMBERSHIP_ROLES).toEqual(['participant', 'coach', 'assistant'])
    expect(COACHING_ROLES).toEqual(['coach', 'assistant'])
    expect(isCoachingRole('coach')).toBe(true)
    expect(isCoachingRole('assistant')).toBe(true)
    expect(isCoachingRole('participant')).toBe(false)
  })
})

describe('needsMatchGuard', () => {
  it('guards only a team that becomes a class group', () => {
    expect(needsMatchGuard('team', 'class_group')).toBe(true)
    expect(needsMatchGuard('team', 'team')).toBe(false)
    expect(needsMatchGuard('class_group', 'team')).toBe(false)
    expect(needsMatchGuard('class_group', 'class_group')).toBe(false)
  })
})

describe('disallowedTeamFields', () => {
  it('allows the team fields on a team', () => {
    expect(
      disallowedTeamFields('team', {
        ageCategoryEntryId: 'entry-orlik',
        league: 'Liga okręgowa',
        seasonId: 'season-1',
      }),
    ).toEqual([])
  })

  it('names every team field set on a class group, ignoring unset and blank values', () => {
    expect(disallowedTeamFields('class_group', { league: 'Liga', seasonId: 'season-1' })).toEqual([
      'league',
      'seasonId',
    ])
    expect(disallowedTeamFields('class_group', { ageCategoryEntryId: 'entry-orlik' })).toEqual(['ageCategoryEntryId'])
    expect(disallowedTeamFields('class_group', { league: '  ', seasonId: 'season-1' })).toEqual(['seasonId'])
    expect(disallowedTeamFields('class_group', { league: null, seasonId: undefined })).toEqual([])
    expect(disallowedTeamFields('class_group', {})).toEqual([])
  })
})

describe('PZPN age categories', () => {
  it('seeds the PZPN categories youngest first under a dictionary key the dictionaries module accepts', () => {
    expect(AGE_CATEGORY_DICTIONARY_KEY).toMatch(/^[a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)*$/)
    expect(PZPN_AGE_CATEGORIES.map((category) => category.value)).toEqual([
      'kids',
      'skrzat',
      'zak',
      'orlik',
      'mlodzik',
      'trampkarz',
      'junior_mlodszy',
      'junior_starszy',
      'senior',
    ])
    expect(PZPN_AGE_CATEGORIES.find((category) => category.value === 'orlik')?.label).toBe('Orlik (U10–U11)')
    // The academy's youngest group (people life-cycle spec phase L3): first, so new clubs list it youngest first.
    expect(PZPN_AGE_CATEGORIES[0]).toEqual({ value: 'kids', label: 'Kids (U4–U5)' })
  })
})

describe('seasonDatesInverted', () => {
  it('refuses a last day before the first day only', () => {
    expect(seasonDatesInverted('2026-08-01', '2027-06-30')).toBe(false)
    expect(seasonDatesInverted('2026-08-01', '2026-08-01')).toBe(false)
    expect(seasonDatesInverted('2026-08-01', '2026-07-31')).toBe(true)
  })
})

describe('firstOverlapping', () => {
  const existing = [
    { id: 'a', validFrom: '2026-01-01', validTo: '2026-03-31' },
    { id: 'b', validFrom: '2026-09-01', validTo: null },
  ]

  it('finds the first period sharing a day with the candidate', () => {
    expect(firstOverlapping({ validFrom: '2026-03-31', validTo: '2026-04-30' }, existing)?.id).toBe('a')
    expect(firstOverlapping({ validFrom: '2027-01-01', validTo: null }, existing)?.id).toBe('b')
  })

  it('returns null when the candidate fits between the periods', () => {
    expect(firstOverlapping({ validFrom: '2026-04-01', validTo: '2026-08-31' }, existing)).toBeNull()
    expect(firstOverlapping({ validFrom: '2026-04-01', validTo: null }, [])).toBeNull()
  })
})

describe('periodStatus and rosterOrder', () => {
  const today = '2026-10-29'

  it('classifies a period on the club day', () => {
    expect(periodStatus({ validFrom: '2026-01-01', validTo: null }, today)).toBe('active')
    expect(periodStatus({ validFrom: '2026-01-01', validTo: today }, today)).toBe('active')
    expect(periodStatus({ validFrom: '2026-01-01', validTo: '2026-10-28' }, today)).toBe('ended')
    expect(periodStatus({ validFrom: '2026-10-30', validTo: null }, today)).toBe('upcoming')
  })

  it('lists active, then upcoming, then ended memberships, the latest start first within each', () => {
    const rows = [
      { id: 'ended-old', validFrom: '2024-01-01', validTo: '2024-12-31' },
      { id: 'active-old', validFrom: '2025-01-01', validTo: null },
      { id: 'upcoming', validFrom: '2026-11-01', validTo: null },
      { id: 'ended-new', validFrom: '2025-01-01', validTo: '2026-06-30' },
      { id: 'active-new', validFrom: '2026-09-01', validTo: null },
    ]
    expect(rosterOrder(rows, today).map((row) => row.id)).toEqual([
      'active-new',
      'active-old',
      'upcoming',
      'ended-new',
      'ended-old',
    ])
    expect(rows[0]?.id).toBe('ended-old')
  })
})

describe('groups error codes', () => {
  it('declares the groups codes with their statuses and message keys under groups.errors', () => {
    expect(errorCodes.map(({ code, status }) => [code, status])).toEqual([
      ['group_team_fields_on_class_group', 422],
      ['groups_reference_invalid', 422],
      ['group_section_inactive', 422],
      ['group_age_range_inverted', 422],
      ['group_has_memberships', 409],
      ['group_has_matches', 409],
      ['group_usage_failed', 503],
      ['membership_overlap', 409],
      ['membership_in_use', 409],
      ['membership_not_started', 422],
      ['season_dates_inverted', 422],
      ['season_name_taken', 409],
      ['season_in_use', 409],
      ['rollover_plan_stale', 409],
      ['rollover_conflicts', 409],
      ['rollover_plan_empty', 422],
      ['rollover_same_season', 422],
      ['rollover_season_overlap', 422],
      ['rollover_group_unknown', 422],
      ['rollover_group_action_duplicate', 422],
      ['rollover_name_required', 422],
      ['rollover_record_unknown', 422],
      ['rollover_record_action_duplicate', 422],
      ['rollover_copy_invalid', 422],
      ['move_preview_stale', 409],
      ['move_same_group', 422],
      ['move_target_inactive', 422],
      ['move_date_in_past', 422],
      ['move_too_many', 422],
    ])
    for (const entry of errorCodes) expect(entry.messageKey).toBe(`groups.errors.${entry.code}`)
  })
})

describe('group names of the bulk import (#65)', () => {
  it('compares names trimmed, case-insensitive and in one Unicode form', () => {
    expect(groupNameKey('  Orliki U8 ')).toBe('orliki u8')
    expect(groupNameKey('ŻAKI')).toBe('żaki')
    // "Ż" as Z + combining dot above equals the precomposed letter.
    expect(groupNameKey('Żaki')).toBe(groupNameKey('Żaki'))
    expect(groupNameKey('Orliki  U8')).not.toBe(groupNameKey('Orliki U8'))
  })

  it('resolves one group, refuses none and more than one, and never guesses', () => {
    const groups = [
      { id: 'g-orliki', name: 'Orliki U8' },
      { id: 'g-zaki-academy', name: 'Żaki' },
      { id: 'g-zaki-pool', name: 'żaki ' },
      { id: 'g-basen', name: 'Basen — początkujący' },
    ]
    const matches = matchGroupNames([' orliki u8', 'ŻAKI', 'Orliki', '', '   ', 'Basen — początkujący'], groups)
    expect(Object.fromEntries(matches)).toEqual({
      ' orliki u8': { status: 'resolved', groupId: 'g-orliki' },
      ŻAKI: { status: 'group_ambiguous' },
      Orliki: { status: 'group_not_found' },
      '': { status: 'group_not_found' },
      '   ': { status: 'group_not_found' },
      'Basen — początkujący': { status: 'resolved', groupId: 'g-basen' },
    })
    expect(matchGroupNames(['Orliki U8'], []).get('Orliki U8')).toEqual({ status: 'group_not_found' })
    expect(matchGroupNames([], groups).size).toBe(0)
  })
})

describe('ageRangeInverted', () => {
  it('refuses a youngest age above the oldest age (#91)', () => {
    expect(ageRangeInverted(10, 8)).toBe(true)
  })

  it('accepts an ordered or equal range and an open bound', () => {
    expect(ageRangeInverted(8, 10)).toBe(false)
    expect(ageRangeInverted(9, 9)).toBe(false)
    expect(ageRangeInverted(10, null)).toBe(false)
    expect(ageRangeInverted(null, 8)).toBe(false)
    expect(ageRangeInverted(null, null)).toBe(false)
  })

  it('bounds an age between 0 and 99 years', () => {
    expect([GROUP_AGE_MIN, GROUP_AGE_MAX]).toEqual([0, 99])
  })
})

describe('parseAgeInput', () => {
  it('reads a blank bound as open', () => {
    expect(parseAgeInput(undefined)).toBeNull()
    expect(parseAgeInput(null)).toBeNull()
    expect(parseAgeInput('  ')).toBeNull()
  })

  it('reads whole years from text or a number', () => {
    expect(parseAgeInput(' 8 ')).toBe(8)
    expect(parseAgeInput(0)).toBe(0)
    expect(parseAgeInput('99')).toBe(99)
  })

  it('refuses fractions, negatives, other types and ages above 99', () => {
    expect(parseAgeInput('8.5')).toBe('invalid')
    expect(parseAgeInput(-1)).toBe('invalid')
    expect(parseAgeInput('100')).toBe('invalid')
    expect(parseAgeInput(true)).toBe('invalid')
  })
})

describe('roster rules (parity spec REQ-A03, #267)', () => {
  it('names the three views and orders roles coaches, assistants, participants', () => {
    expect(ROSTER_VIEWS).toEqual(['active', 'upcoming', 'ended'])
    expect(ROSTER_ROLE_ORDER).toEqual(['coach', 'assistant', 'participant'])
    expect(rosterRoleRank('coach')).toBe(0)
    expect(rosterRoleRank('assistant')).toBe(1)
    expect(rosterRoleRank('participant')).toBe(2)
    expect(rosterRoleRank('unknown')).toBe(3)
  })

  it('sorts by role, then the latest start first, then the id', () => {
    const rows = [
      { id: 'p1', role: 'participant', validFrom: '2026-09-01' },
      { id: 'c2', role: 'coach', validFrom: '2026-01-01' },
      { id: 'a1', role: 'assistant', validFrom: '2026-02-01' },
      { id: 'p3', role: 'participant', validFrom: '2026-10-01' },
      { id: 'c1', role: 'coach', validFrom: '2026-01-01' },
    ]
    expect(rosterRoleOrder(rows).map((row) => row.id)).toEqual(['c1', 'c2', 'a1', 'p3', 'p1'])
    expect(rows[0].id).toBe('p1')
  })

  it('builds the SQL role key from the same ranks as rosterRoleRank (#359)', () => {
    const sql = rosterRoleRankSql('m')
    expect(sql).toBe("case m.role when 'coach' then 0 when 'assistant' then 1 when 'participant' then 2 else 3 end")
    const ranks = new Map([...sql.matchAll(/when '(\w+)' then (\d+)/g)].map((match) => [match[1], Number(match[2])]))
    for (const role of ROSTER_ROLE_ORDER) expect(ranks.get(role)).toBe(rosterRoleRank(role))
    expect(Number(/else (\d+) end$/.exec(sql)?.[1])).toBe(rosterRoleRank('unknown'))
  })

  it('turns a view into bounds on the club day', () => {
    expect(rosterViewBounds('active', '2026-11-17')).toEqual({
      view: 'active',
      startsOnOrBefore: '2026-11-17',
      endsOnOrAfter: '2026-11-17',
    })
    expect(rosterViewBounds('upcoming', '2026-11-17')).toEqual({ view: 'upcoming', startsAfter: '2026-11-17' })
    expect(rosterViewBounds('ended', '2026-11-17')).toEqual({ view: 'ended', endsBefore: '2026-11-17' })
  })

  it('offers End only on an active membership', () => {
    expect(membershipActions('active')).toEqual(['edit', 'end', 'remove'])
    expect(membershipActions('upcoming')).toEqual(['edit', 'remove'])
    expect(membershipActions('ended')).toEqual(['edit', 'remove'])
  })

  it('refuses an end before the start or of a membership that has not started', () => {
    expect(endRefused({ validFrom: '2026-12-01' }, '2026-12-05', '2026-11-17')).toBe(true)
    expect(endRefused({ validFrom: '2026-09-01' }, '2026-08-31', '2026-11-17')).toBe(true)
    expect(endRefused({ validFrom: '2026-09-01' }, '2026-09-01', '2026-11-17')).toBe(false)
    expect(endRefused({ validFrom: '2026-11-17' }, '2026-11-30', '2026-11-17')).toBe(false)
  })

  it('plans a group move: ends the day before and starts on the date with the same planned last day (REQ-L11)', () => {
    const open = { groupId: 'a', validFrom: '2026-09-01', validTo: null }
    expect(planMove(open, { toGroupId: 'b', date: '2026-11-15' }, '2026-11-10')).toEqual({
      ok: true,
      lastDay: '2026-11-14',
      next: { validFrom: '2026-11-15', validTo: null },
    })
    expect(planMove({ ...open, validTo: '2027-06-30' }, { toGroupId: 'b', date: '2026-11-15' }, '2026-11-10')).toEqual({
      ok: true,
      lastDay: '2026-11-14',
      next: { validFrom: '2026-11-15', validTo: '2027-06-30' },
    })
  })

  it('refuses a move to the same group, before the start, or after the membership is over', () => {
    const open = { groupId: 'a', validFrom: '2026-09-01', validTo: null }
    expect(planMove(open, { toGroupId: 'a', date: '2026-11-15' }, '2026-11-10')).toEqual({
      ok: false,
      problem: 'same_group',
    })
    expect(planMove(open, { toGroupId: 'b', date: '2026-09-01' }, '2026-11-10')).toEqual({
      ok: false,
      problem: 'not_started',
    })
    expect(
      planMove({ ...open, validFrom: '2026-12-01' }, { toGroupId: 'b', date: '2027-01-01' }, '2026-11-10'),
    ).toEqual({ ok: false, problem: 'not_started' })
    expect(planMove({ ...open, validTo: '2026-11-14' }, { toGroupId: 'b', date: '2026-11-15' }, '2026-11-10')).toEqual({
      ok: false,
      problem: 'not_active_on_date',
    })
    expect(
      planMove({ ...open, validTo: '2026-11-15' }, { toGroupId: 'b', date: '2026-11-15' }, '2026-11-10'),
    ).toMatchObject({ ok: true })
  })

  it('offers the 1st of the next month as the move date, never before today or the day after the start', () => {
    expect(moveDateBounds('2026-11-19', '2026-09-01')).toEqual({ min: '2026-11-19', initial: '2026-12-01' })
    expect(moveDateBounds('2026-12-05', null)).toEqual({ min: '2026-12-05', initial: '2027-01-01' })
    expect(moveDateBounds('2026-11-19', '2026-12-10')).toEqual({ min: '2026-12-11', initial: '2026-12-11' })
  })

  it('removes a membership before its start, or a started one only when never used', () => {
    expect(mayRemoveMembership({ validFrom: '2026-12-01' }, '2026-11-17', null)).toBe(true)
    expect(mayRemoveMembership({ validFrom: '2026-11-17' }, '2026-11-17', false)).toBe(true)
    expect(mayRemoveMembership({ validFrom: '2026-11-17' }, '2026-11-17', true)).toBe(false)
    expect(mayRemoveMembership({ validFrom: '2026-09-01' }, '2026-11-17', null)).toBe(false)
  })
  it('refuses a bulk move of more than 100 children, to the same group or on a past day (REQ-L15, Q-L08, Q-L22)', () => {
    const move = { fromGroupId: 'a', toGroupId: 'b', date: '2026-12-01', count: 7 }
    expect(MOVE_MANY_LIMIT).toBe(100)
    expect(moveManyProblem(move, '2026-11-19')).toBeNull()
    expect(moveManyProblem({ ...move, count: 100 }, '2026-11-19')).toBeNull()
    expect(moveManyProblem({ ...move, count: 101 }, '2026-11-19')).toBe('too_many')
    expect(moveManyProblem({ ...move, toGroupId: 'a' }, '2026-11-19')).toBe('same_group')
    expect(moveManyProblem({ ...move, date: '2026-11-18' }, '2026-11-19')).toBe('date_in_past')
    expect(moveManyProblem({ ...move, date: '2026-11-19' }, '2026-11-19')).toBeNull()
  })

  it('tells per child whether a bulk move moves it or skips it with a reason (Q-L24)', () => {
    const open = { groupId: 'a', validFrom: '2026-09-01', validTo: null }
    const movable = planMove(open, { toGroupId: 'b', date: '2026-12-01' }, '2026-11-19')
    expect(MOVE_OUTCOMES).toEqual(['move', 'skip_already_member', 'skip_not_active'])
    expect(moveOutcome(movable, false)).toBe('move')
    expect(moveOutcome(movable, true)).toBe('skip_already_member')
    const upcoming = planMove(
      { ...open, validFrom: '2026-12-01' },
      { toGroupId: 'b', date: '2026-12-01' },
      '2026-11-19',
    )
    expect(moveOutcome(upcoming, false)).toBe('skip_not_active')
    expect(moveOutcome(upcoming, true)).toBe('skip_not_active')
  })

  it("fits a child by the age on the move date within the target group's range (REQ-L15)", () => {
    const skrzaty = { ageFrom: 6, ageTo: 7 }
    // Six on 1 September, still five the day before.
    expect(fitsAgeRange('2020-09-01', '2026-09-01', skrzaty)).toBe(true)
    expect(fitsAgeRange('2020-09-01', '2026-08-31', skrzaty)).toBe(false)
    expect(fitsAgeRange('2018-09-02', '2026-09-01', skrzaty)).toBe(true)
    expect(fitsAgeRange('2018-09-01', '2026-09-01', skrzaty)).toBe(false)
    expect(fitsAgeRange('2015-01-01', '2026-09-01', { ageFrom: 6, ageTo: null })).toBe(true)
    expect(fitsAgeRange('2024-01-01', '2026-09-01', { ageFrom: null, ageTo: 7 })).toBe(true)
    expect(fitsAgeRange('2010-01-01', '2026-09-01', { ageFrom: null, ageTo: 7 })).toBe(false)
    expect(fitsAgeRange('2020-01-01', '2026-09-01', { ageFrom: null, ageTo: null })).toBeNull()
    expect(fitsAgeRange(null, '2026-09-01', skrzaty)).toBeNull()
  })
})
