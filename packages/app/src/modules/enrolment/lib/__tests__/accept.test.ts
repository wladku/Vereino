import { describe, expect, it } from '@jest/globals'
import {
  START_DAY_MAX_DAYS_AHEAD,
  acceptPlan,
  freedPlaceGroups,
  freedPlaceKey,
  needsOverLimit,
  reusableIds,
  seasonEnded,
  startDayValid,
} from '../accept'

const candidates = [
  { personId: 'child-1', role: 'participant' as const },
  { personId: 'mum-1', role: 'guardian' as const },
]

describe('start day (BR-J6)', () => {
  it('accepts today up to the season end and refuses the past, the far future and after the season', () => {
    expect(startDayValid('2026-11-27', '2026-11-27', null)).toBe(true)
    expect(startDayValid('2026-11-26', '2026-11-27', null)).toBe(false)
    expect(startDayValid('2026-12-01', '2026-11-27', '2027-06-30')).toBe(true)
    expect(startDayValid('2027-07-01', '2026-11-27', '2027-06-30')).toBe(false)
    expect(START_DAY_MAX_DAYS_AHEAD).toBe(366)
    expect(startDayValid('2027-11-28', '2026-11-27', null)).toBe(true)
    expect(startDayValid('2027-11-29', '2026-11-27', null)).toBe(false)
  })
})

describe('accept plan (DD-J10, DD-J11)', () => {
  it('lists the reusable persons of a role', () => {
    expect([...reusableIds(candidates, 'guardian')]).toEqual(['mum-1'])
  })

  it('plans a new family and a reused guardian of a child', () => {
    expect(acceptPlan('child', {}, candidates)).toEqual({
      plan: { participant: { reuse: null }, guardian: { reuse: null }, invitee: 'guardian' },
    })
    expect(
      acceptPlan('child', { child: { personId: 'child-1' }, guardian: { personId: 'mum-1' } }, candidates),
    ).toEqual({ plan: { participant: { reuse: 'child-1' }, guardian: { reuse: 'mum-1' }, invitee: 'guardian' } })
  })

  it('gives an adult no guardian and invites the adult', () => {
    expect(acceptPlan('adult', { guardian: { personId: 'mum-1' } }, candidates)).toEqual({
      plan: { participant: { reuse: null }, guardian: null, invitee: 'participant' },
    })
  })

  it('refuses a person that is not a possible duplicate of its role', () => {
    expect(acceptPlan('child', { child: { personId: 'mum-1' } }, candidates)).toEqual({
      issue: 'candidate_invalid',
      field: 'child',
    })
    expect(acceptPlan('child', { guardian: { personId: 'child-1' } }, candidates)).toEqual({
      issue: 'candidate_invalid',
      field: 'guardian',
    })
  })

  it('refuses the child as its own guardian', () => {
    const both = [...candidates, { personId: 'child-1', role: 'guardian' as const }]
    expect(acceptPlan('child', { child: { personId: 'child-1' }, guardian: { personId: 'child-1' } }, both)).toEqual({
      issue: 'guardian_is_participant',
      field: 'guardian',
    })
  })
})

describe('places (BR-J4, DD-J15)', () => {
  it('needs "beyond the limit" only for a full group with a limit', () => {
    expect(needsOverLimit({ placesLimit: null, occupied: 40 })).toBe(false)
    expect(needsOverLimit({ placesLimit: 18, occupied: 17 })).toBe(false)
    expect(needsOverLimit({ placesLimit: 18, occupied: 18 })).toBe(true)
  })

  it('finds the active groups with a waiting list and a free place', () => {
    const targets = [
      { groupId: 'a', placesLimit: 2, occupied: 1, isActive: true },
      { groupId: 'b', placesLimit: 2, occupied: 2, isActive: true },
      { groupId: 'c', placesLimit: null, occupied: 9, isActive: true },
      { groupId: 'd', placesLimit: 2, occupied: 0, isActive: false },
      { groupId: 'e', placesLimit: 2, occupied: 0, isActive: true },
    ]
    expect(freedPlaceGroups(targets, new Set(['a', 'b', 'c', 'd']))).toEqual(['a', 'c'])
    expect(freedPlaceKey('a', '2026-11-27')).toBe('place_freed:a:2026-11-27')
  })

  it('ends an application with its season only when there is one', () => {
    expect(seasonEnded(null, '2026-11-27')).toBe(false)
    expect(seasonEnded('2026-11-27', '2026-11-27')).toBe(false)
    expect(seasonEnded('2026-11-26', '2026-11-27')).toBe(true)
  })
})
