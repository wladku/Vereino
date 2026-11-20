import { describe, expect, it } from '@jest/globals'
import { coachesAGroup, organizesClubEvents, sessionPageView, sessionPerspectives } from '../member-session'

describe('sessionPerspectives', () => {
  it('reads a guardian as guardian unless they ask for their own view', () => {
    expect(sessionPerspectives(null, { hasWards: true, coaches: false })).toEqual({ member: 'guardian', staff: null })
    expect(sessionPerspectives('self', { hasWards: true, coaches: false })).toEqual({ member: 'self', staff: null })
    expect(sessionPerspectives('guardian', { hasWards: false, coaches: false })).toEqual({
      member: 'guardian',
      staff: null,
    })
    expect(sessionPerspectives(null, { hasWards: false, coaches: false })).toEqual({ member: 'self', staff: null })
  })

  it('adds the coach read for a person who coaches, whatever the link asks for', () => {
    expect(sessionPerspectives('coach', { hasWards: true, coaches: true })).toEqual({
      member: 'guardian',
      staff: 'coach',
    })
    expect(sessionPerspectives('coach', { hasWards: false, coaches: true })).toEqual({ member: 'self', staff: 'coach' })
    expect(sessionPerspectives('guardian', { hasWards: true, coaches: true })).toEqual({
      member: 'guardian',
      staff: 'coach',
    })
  })

  it('reads as the section coordinator when the link asks for it, or for a coordinator who does not coach', () => {
    expect(sessionPerspectives('coordinator', { hasWards: false, coaches: true, coordinates: true })).toEqual({
      member: 'self',
      staff: 'coordinator',
    })
    expect(sessionPerspectives('coach', { hasWards: false, coaches: true, coordinates: true })).toEqual({
      member: 'self',
      staff: 'coach',
    })
    expect(sessionPerspectives(null, { hasWards: true, coaches: false, coordinates: true })).toEqual({
      member: 'guardian',
      staff: 'coordinator',
    })
    expect(sessionPerspectives('coordinator', { hasWards: false, coaches: false, coordinates: false })).toEqual({
      member: 'self',
      staff: null,
    })
  })
})

describe('sessionPageView', () => {
  it('shows the session with the blocks of every perspective that found it', () => {
    expect(sessionPageView('ok', 'off')).toEqual({ kind: 'show', member: true, coach: false })
    expect(sessionPageView('not_found', 'ok')).toEqual({ kind: 'show', member: false, coach: true })
    expect(sessionPageView('ok', 'ok')).toEqual({ kind: 'show', member: true, coach: true })
    expect(sessionPageView('ok', 'forbidden')).toEqual({ kind: 'show', member: true, coach: false })
    expect(sessionPageView('ok', 'loading')).toEqual({ kind: 'show', member: true, coach: false })
  })

  it('waits for a running read, then reports a failed one', () => {
    expect(sessionPageView('loading', 'forbidden')).toEqual({ kind: 'loading' })
    expect(sessionPageView('not_found', 'loading')).toEqual({ kind: 'loading' })
    expect(sessionPageView('error', 'forbidden')).toEqual({ kind: 'error' })
    expect(sessionPageView('not_found', 'error')).toEqual({ kind: 'error' })
  })

  it('tells a coach the session is not theirs, and anyone else that it is not in their calendar', () => {
    expect(sessionPageView('not_found', 'forbidden')).toEqual({ kind: 'not_yours' })
    expect(sessionPageView('not_found', 'not_found')).toEqual({ kind: 'not_found' })
    expect(sessionPageView('not_found', 'off')).toEqual({ kind: 'not_found' })
  })
})

describe('the staff actions a person is offered (E20-S10, #489)', () => {
  it('offers the coach’s "New event" only to a person who coaches a group', () => {
    expect(coachesAGroup(['self', 'coach'])).toBe(true)
    expect(coachesAGroup(['self', 'coordinator'])).toBe(false)
    expect(coachesAGroup(['self', 'facility_operator'])).toBe(false)
  })

  it('sends a coordinator and the club administrator to the club events', () => {
    expect(organizesClubEvents(['self', 'coordinator'])).toBe(true)
    expect(organizesClubEvents(['club_admin'])).toBe(true)
    expect(organizesClubEvents(['self', 'coach'])).toBe(false)
  })
})
