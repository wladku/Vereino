import { describe, expect, it } from '@jest/globals'
import { sessionPageView, sessionPerspectives } from '../member-session'

describe('sessionPerspectives', () => {
  it('reads a guardian as guardian unless they ask for their own view', () => {
    expect(sessionPerspectives(null, { hasWards: true, coaches: false })).toEqual({ member: 'guardian', coach: false })
    expect(sessionPerspectives('self', { hasWards: true, coaches: false })).toEqual({ member: 'self', coach: false })
    expect(sessionPerspectives('guardian', { hasWards: false, coaches: false })).toEqual({
      member: 'guardian',
      coach: false,
    })
    expect(sessionPerspectives(null, { hasWards: false, coaches: false })).toEqual({ member: 'self', coach: false })
  })

  it('adds the coach read for a person who coaches, whatever the link asks for', () => {
    expect(sessionPerspectives('coach', { hasWards: true, coaches: true })).toEqual({ member: 'guardian', coach: true })
    expect(sessionPerspectives('coach', { hasWards: false, coaches: true })).toEqual({ member: 'self', coach: true })
    expect(sessionPerspectives('guardian', { hasWards: true, coaches: true })).toEqual({
      member: 'guardian',
      coach: true,
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
