import { describe, expect, it } from '@jest/globals'
import {
  RESULT_NOTE_MAX,
  SCORE_MAX,
  SCORE_TYPES,
  clubFirstScore,
  resultNoteOrNull,
  scoreProblem,
  scoreView,
  showsScore,
} from '../score'

// E10-S07 (#272, REQ-A15): which sessions take a score, when, and how it is shown.
const NOW = new Date('2026-11-17T18:00:00Z')
const STARTED = { status: 'planned', startAt: new Date('2026-11-17T17:00:00Z') }
const TOMORROW = { status: 'planned', startAt: new Date('2026-11-18T17:00:00Z') }

describe('scoreProblem', () => {
  it('accepts a match or sparring that started, also once closed', () => {
    expect(SCORE_TYPES).toEqual(['match', 'sparring'])
    expect(scoreProblem('match', STARTED, NOW)).toBeNull()
    expect(scoreProblem('sparring', { ...STARTED, status: 'done' }, NOW)).toBeNull()
    expect(scoreProblem('match', { status: 'planned', startAt: NOW }, NOW)).toBeNull()
  })

  it('refuses another type, a cancelled session and a session that has not started', () => {
    expect(scoreProblem('training', STARTED, NOW)).toBe('not_applicable')
    expect(scoreProblem('match', { ...STARTED, status: 'cancelled' }, NOW)).toBe('cancelled')
    expect(scoreProblem('match', TOMORROW, NOW)).toBe('before_start')
  })
})

describe('scoreView', () => {
  it('returns the score with its note, or null when none was recorded', () => {
    expect(scoreView({ scoreHome: 3, scoreAway: 1, resultNote: 'Rain' })).toEqual({ home: 3, away: 1, note: 'Rain' })
    expect(scoreView({ scoreHome: 0, scoreAway: 0 })).toEqual({ home: 0, away: 0, note: null })
    expect(scoreView({ scoreHome: null, scoreAway: null, resultNote: null })).toBeNull()
    expect(scoreView({})).toBeNull()
  })
})

describe('clubFirstScore', () => {
  it("puts the club's team first at home and away", () => {
    expect(clubFirstScore({ home: 3, away: 1 }, false)).toBe('3:1')
    expect(clubFirstScore({ home: 3, away: 1 }, true)).toBe('1:3')
  })
})

describe('resultNoteOrNull', () => {
  it('trims a note and drops a blank one', () => {
    expect(resultNoteOrNull('  Good game ')).toBe('Good game')
    expect(resultNoteOrNull('   ')).toBeNull()
    expect(resultNoteOrNull(null)).toBeNull()
    expect(resultNoteOrNull(undefined)).toBeNull()
    expect(SCORE_MAX).toBe(99)
    expect(RESULT_NOTE_MAX).toBe(500)
  })
})

describe('showsScore', () => {
  it('shows the block for a started match or sparring only', () => {
    const started = { status: 'planned', startAt: STARTED.startAt.toISOString() }
    expect(showsScore('match', started, NOW)).toBe(true)
    expect(showsScore('training', started, NOW)).toBe(false)
    expect(showsScore(null, started, NOW)).toBe(false)
    expect(showsScore(undefined, started, NOW)).toBe(false)
    expect(showsScore('match', { status: 'planned', startAt: TOMORROW.startAt.toISOString() }, NOW)).toBe(false)
  })
})
