import { describe, expect, it } from '@jest/globals'
import { CLOSURE_REASONS, closurePeriodProblem, closureWindowChanged } from '../closures'

describe('closures (DD-22)', () => {
  it('lists the reasons of the glossary', () => {
    expect(CLOSURE_REASONS).toEqual(['snow', 'maintenance', 'municipal_event', 'school', 'other'])
  })

  it('requires the end after the start', () => {
    const start = new Date('2026-11-10T16:00:00Z')
    expect(closurePeriodProblem(start, new Date('2026-11-10T20:00:00Z'))).toBeNull()
    expect(closurePeriodProblem(start, start)).toBe('inverted')
    expect(closurePeriodProblem(new Date('x'), start)).toBe('malformed')
    expect(closurePeriodProblem(start, new Date('x'))).toBe('malformed')
  })

  it('notices a moved window or place', () => {
    const before = {
      placeId: 'p',
      startsAt: new Date('2026-11-10T16:00:00Z'),
      endsAt: new Date('2026-11-10T20:00:00Z'),
    }
    expect(closureWindowChanged(before, { ...before })).toBe(false)
    expect(closureWindowChanged(before, { ...before, placeId: 'q' })).toBe(true)
    expect(closureWindowChanged(before, { ...before, startsAt: new Date('2026-11-10T15:00:00Z') })).toBe(true)
    expect(closureWindowChanged(before, { ...before, endsAt: new Date('2026-11-10T21:00:00Z') })).toBe(true)
  })
})
