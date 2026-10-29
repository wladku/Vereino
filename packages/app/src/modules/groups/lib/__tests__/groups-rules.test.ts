import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'
import {
  COACHING_ROLES,
  GROUP_KINDS,
  MEMBERSHIP_ROLES,
  disallowedTeamFields,
  firstOverlapping,
  isCoachingRole,
  periodStatus,
  rosterOrder,
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

describe('disallowedTeamFields', () => {
  it('allows the team fields on a team', () => {
    expect(disallowedTeamFields('team', { league: 'Liga okręgowa', seasonId: 'season-1' })).toEqual([])
  })

  it('names every team field set on a class group, ignoring unset and blank values', () => {
    expect(disallowedTeamFields('class_group', { league: 'Liga', seasonId: 'season-1' })).toEqual([
      'league',
      'seasonId',
    ])
    expect(disallowedTeamFields('class_group', { league: '  ', seasonId: 'season-1' })).toEqual(['seasonId'])
    expect(disallowedTeamFields('class_group', { league: null, seasonId: undefined })).toEqual([])
    expect(disallowedTeamFields('class_group', {})).toEqual([])
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
      ['group_has_memberships', 409],
      ['membership_overlap', 409],
      ['season_dates_inverted', 422],
      ['season_name_taken', 409],
      ['season_in_use', 409],
    ])
    for (const entry of errorCodes) expect(entry.messageKey).toBe(`groups.errors.${entry.code}`)
  })
})
