import { describe, expect, it } from '@jest/globals'
import {
  SUBSTITUTION_KINDS,
  SUBSTITUTION_REASON_MAX,
  UNSETTLED_AFTER_HOURS,
  absenceProblem,
  assignmentKind,
  canReportAbsence,
  isUnsettled,
  originalCoach,
  reasonOrNull,
  substituteFor,
  substituteOptions,
  unsettledCutoff,
  unsettledEntries,
} from '../substitutions'

// E06-S13 (#95): the substitution rules — whose session it is, the kind of an assignment, when the assigned coach may
// report an absence, the substitute dialog's options and the "unsettled" predicate. Instants are fixed ISO strings.
const NOW = new Date('2026-11-06T12:00:00Z')

describe('substitution entries', () => {
  it('knows the three kinds and the 200-character reason', () => {
    expect(SUBSTITUTION_KINDS).toEqual(['absence_reported', 'substitute_assigned', 'coach_restored'])
    expect(SUBSTITUTION_REASON_MAX).toBe(200)
  })

  it('stores a trimmed reason and nothing for a blank one', () => {
    expect(reasonOrNull('  Kurs trenerski ')).toBe('Kurs trenerski')
    expect(reasonOrNull('   ')).toBeNull()
    expect(reasonOrNull('')).toBeNull()
    expect(reasonOrNull(null)).toBeNull()
    expect(reasonOrNull(undefined)).toBeNull()
  })
})

describe('whose session it is', () => {
  const absence = { previousCoachPersonId: 'marek', newCoachPersonId: null }
  const substitute = { previousCoachPersonId: null, newCoachPersonId: 'bartek' }

  it('is the coach before the first entry, or the current coach without entries', () => {
    expect(originalCoach([absence, substitute], 'bartek')).toBe('marek')
    expect(originalCoach([], 'marek')).toBe('marek')
    expect(originalCoach([], null)).toBeNull()
    expect(originalCoach([substitute], 'bartek')).toBeNull()
  })

  it('restores the own coach and substitutes anyone else', () => {
    expect(assignmentKind([absence], null, 'marek')).toBe('coach_restored')
    expect(assignmentKind([absence], null, 'bartek')).toBe('substitute_assigned')
    // A direct change without an absence: the coach before it owns the session.
    expect(assignmentKind([], 'marek', 'bartek')).toBe('substitute_assigned')
    // A session planned without a coach has no own coach to restore.
    expect(assignmentKind([], null, 'bartek')).toBe('substitute_assigned')
  })

  it('names the own coach while a substitute leads the session', () => {
    expect(substituteFor([absence, substitute], 'bartek')).toBe('marek')
    expect(
      substituteFor([absence, substitute, { previousCoachPersonId: 'bartek', newCoachPersonId: 'marek' }], 'marek'),
    ).toBeNull()
    expect(substituteFor([absence], null)).toBeNull()
    expect(substituteFor([], 'marek')).toBeNull()
    expect(substituteFor([substitute], 'bartek')).toBeNull()
  })
})

describe('reporting an absence', () => {
  const start = new Date('2026-11-06T16:00:00Z')

  it('needs a planned session that has not started', () => {
    expect(absenceProblem({ status: 'planned', startAt: start }, NOW)).toBeNull()
    expect(absenceProblem({ status: 'cancelled', startAt: start }, NOW)).toBe('not_planned')
    expect(absenceProblem({ status: 'done', startAt: start }, NOW)).toBe('not_planned')
    expect(absenceProblem({ status: 'planned', startAt: NOW }, NOW)).toBe('started')
    expect(absenceProblem({ status: 'planned', startAt: new Date('2026-11-06T11:00:00Z') }, NOW)).toBe('started')
  })

  it('shows the button to the assigned coach only, while the absence is possible', () => {
    const occurrence = { status: 'planned', coachPersonId: 'marek', startAt: start.toISOString() }
    expect(canReportAbsence(occurrence, 'marek', NOW)).toBe(true)
    expect(canReportAbsence(occurrence, 'bartek', NOW)).toBe(false)
    expect(canReportAbsence(occurrence, null, NOW)).toBe(false)
    expect(canReportAbsence({ ...occurrence, coachPersonId: null }, 'marek', NOW)).toBe(false)
    expect(canReportAbsence({ ...occurrence, status: 'cancelled' }, 'marek', NOW)).toBe(false)
    expect(canReportAbsence({ ...occurrence, startAt: '2026-11-06T10:00:00Z' }, 'marek', NOW)).toBe(false)
    expect(canReportAbsence({ ...occurrence, startAt: 'not a date' }, 'marek', NOW)).toBe(false)
  })
})

describe('unsettled sessions', () => {
  it('counts a planned session 24 hours after its end', () => {
    expect(UNSETTLED_AFTER_HOURS).toBe(24)
    expect(unsettledCutoff(NOW).toISOString()).toBe('2026-11-05T12:00:00.000Z')
    expect(isUnsettled({ status: 'planned', endAt: '2026-11-05T12:00:00.000Z' }, NOW)).toBe(true)
    expect(isUnsettled({ status: 'planned', endAt: '2026-11-04T18:00:00.000Z' }, NOW)).toBe(true)
    expect(isUnsettled({ status: 'planned', endAt: '2026-11-05T12:00:01.000Z' }, NOW)).toBe(false)
    expect(isUnsettled({ status: 'done', endAt: '2026-11-01T18:00:00.000Z' }, NOW)).toBe(false)
    expect(isUnsettled({ status: 'cancelled', endAt: '2026-11-01T18:00:00.000Z' }, NOW)).toBe(false)
    expect(isUnsettled({ status: null, endAt: '2026-11-01T18:00:00.000Z' }, NOW)).toBe(false)
    expect(isUnsettled({ status: 'planned', endAt: null }, NOW)).toBe(false)
    expect(isUnsettled({ status: 'planned', endAt: 'soon' }, NOW)).toBe(false)
  })

  it('keeps the unsettled calendar entries, oldest first', () => {
    const entry = (id: string, startAt: string, endAt: string, status = 'planned') => ({
      id,
      occurrence: { status, startAt, endAt },
    })
    const entries = [
      entry('later', '2026-11-04T16:00:00Z', '2026-11-04T17:00:00Z'),
      entry('closed', '2026-11-01T16:00:00Z', '2026-11-01T17:00:00Z', 'done'),
      entry('earlier', '2026-11-02T16:00:00Z', '2026-11-02T17:00:00Z'),
      entry('yesterday', '2026-11-05T16:00:00Z', '2026-11-05T17:00:00Z'),
    ]
    expect(unsettledEntries(entries, NOW).map((item) => item.id)).toEqual(['earlier', 'later'])
  })
})

describe('substitute options', () => {
  const candidates = [
    { id: 'bartek', name: 'Bartek Nowak' },
    { id: 'marek', name: 'Marek Wiśniewski' },
    { id: 'piotr', name: 'Piotr Zieliński' },
  ]

  it('leaves out the current coach and carries the earliest session that keeps a coach busy', () => {
    const busy = [
      { id: 's2', coachPersonId: 'piotr', activityName: 'Orliki', startAt: new Date('2026-11-06T17:30:00Z') },
      { id: 's1', coachPersonId: 'piotr', activityName: 'Żaki', startAt: new Date('2026-11-06T17:00:00Z') },
      { id: 's3', coachPersonId: 'piotr', activityName: null, startAt: new Date('2026-11-06T18:00:00Z') },
    ]
    expect(substituteOptions(candidates, busy, 'marek')).toEqual([
      { id: 'bartek', name: 'Bartek Nowak', busy: null },
      {
        id: 'piotr',
        name: 'Piotr Zieliński',
        busy: { occurrenceId: 's1', activityName: 'Żaki', startAt: '2026-11-06T17:00:00.000Z' },
      },
    ])
  })

  it('offers everyone for a session without a coach', () => {
    expect(substituteOptions(candidates, [], null).map((option) => option.id)).toEqual(['bartek', 'marek', 'piotr'])
  })
})
