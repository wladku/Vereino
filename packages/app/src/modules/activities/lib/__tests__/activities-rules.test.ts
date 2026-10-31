import { describe, expect, it } from '@jest/globals'
import { Recurrence, type Recurrence as RecurrenceRule } from '@vereino/core'
import { errorCodes } from '../error-codes'
import {
  ACTIVITY_TYPES,
  EVENT_TYPES,
  HORIZON_WEEKS,
  OCCURRENCE_STATUSES,
  TEAM_ONLY_TYPES,
  cancellationPersonIds,
  cancellationRecipients,
  generationWindow,
  horizonEnd,
  isPinnedSession,
  lastSessionDay,
  localDateTime,
  ruleYieldsSessions,
  sessionConflicts,
  sessionTransitions,
  typeAllowedForGroup,
  wallTimeInZone,
} from '../activities-rules'

function rule(text: string): RecurrenceRule {
  const parsed = Recurrence.parse(text)
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.error))
  return parsed.value
}

const at = (iso: string) => new Date(iso)

describe('activity types', () => {
  it('declares the types and keeps match and sparring for teams', () => {
    expect(ACTIVITY_TYPES).toEqual(['training', 'match', 'sparring', 'tournament', 'camp', 'other'])
    expect(TEAM_ONLY_TYPES).toEqual(['match', 'sparring'])
    expect(EVENT_TYPES).toEqual(['tournament', 'other'])
    expect(typeAllowedForGroup('sparring', 'team')).toBe(true)
    expect(typeAllowedForGroup('sparring', 'class_group')).toBe(false)
    expect(typeAllowedForGroup('match', 'class_group')).toBe(false)
    expect(typeAllowedForGroup('tournament', 'class_group')).toBe(true)
  })
})

describe('session statuses', () => {
  it('moves forward from planned and reopens for the administrator', () => {
    expect(OCCURRENCE_STATUSES).toEqual(['planned', 'done', 'cancelled'])
    expect(sessionTransitions.canTransition('planned', 'cancelled')).toBe(true)
    expect(sessionTransitions.canTransition('done', 'cancelled')).toBe(false)
    expect(sessionTransitions.canTransition('cancelled', 'cancelled')).toBe(false)
    expect(sessionTransitions.isEntry('planned')).toBe(true)
  })
})

describe('the generation horizon', () => {
  it('spans 16 weeks from today, never the past, clipped to the series', () => {
    expect(HORIZON_WEEKS).toBe(16)
    expect(horizonEnd('2026-10-29')).toBe('2027-02-18')
    expect(generationWindow('2026-10-29', '2026-09-01', null)).toEqual({ from: '2026-10-29', to: '2027-02-18' })
    expect(generationWindow('2026-10-29', '2026-11-03', '2026-12-31')).toEqual({
      from: '2026-11-03',
      to: '2026-12-31',
    })
    expect(generationWindow('2026-10-29', '2026-09-01', '2027-06-30')).toEqual({
      from: '2026-10-29',
      to: '2027-02-18',
    })
    expect(generationWindow('2026-10-29', '2026-09-01', '2026-10-01')).toBeNull()
  })

  it('knows whether a rule yields a session before its end', () => {
    expect(ruleYieldsSessions(rule('FREQ=WEEKLY;BYDAY=TU'), '2026-11-04', '2026-11-09')).toBe(false)
    expect(ruleYieldsSessions(rule('FREQ=WEEKLY;BYDAY=TU'), '2026-11-04', '2026-11-10')).toBe(true)
    expect(ruleYieldsSessions(rule('FREQ=WEEKLY;BYDAY=TU;COUNT=1\nEXDATE:20261110'), '2026-11-04', null)).toBe(false)
    expect(ruleYieldsSessions(rule('FREQ=WEEKLY;BYDAY=TU'), '2026-11-04', null)).toBe(true)
  })
})

describe('lastSessionDay', () => {
  it('takes the earlier of the rule end and the series end, the day of a one-off, or null when open', () => {
    expect(lastSessionDay(null, '2026-11-07', null)).toBe('2026-11-07')
    expect(lastSessionDay(rule('FREQ=WEEKLY;BYDAY=TU'), '2026-11-03', null)).toBeNull()
    expect(lastSessionDay(rule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630'), '2026-11-03', null)).toBe('2027-06-30')
    expect(lastSessionDay(rule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630'), '2026-11-03', '2027-05-31')).toBe('2027-05-31')
    expect(lastSessionDay(rule('FREQ=WEEKLY;BYDAY=TU;COUNT=4'), '2026-11-03', '2026-12-31')).toBe('2026-12-31')
  })
})

describe('wall time of an instant', () => {
  it('reads the club zone', () => {
    expect(wallTimeInZone(at('2026-11-07T08:30:00Z'), 'Europe/Warsaw')).toBe('09:30:00')
    expect(wallTimeInZone(at('2026-11-07T23:15:05Z'), 'Europe/Warsaw')).toBe('00:15:05')
    expect(localDateTime(at('2026-11-07T23:15:00Z'), 'Europe/Warsaw')).toEqual({
      date: '2026-11-08',
      time: '00:15:00',
    })
  })
})

describe('sessionConflicts', () => {
  const candidates = [
    { key: '2026-11-10', startAt: at('2026-11-10T16:00:00Z'), endAt: at('2026-11-10T17:30:00Z') },
    { key: '2026-11-17', startAt: at('2026-11-17T16:00:00Z'), endAt: at('2026-11-17T17:30:00Z') },
  ]
  const existing = [
    // On the complex the pitch belongs to: blocks the pitch.
    {
      id: 'complex',
      placeId: 'orlik',
      coachPersonId: null,
      startAt: at('2026-11-10T17:00:00Z'),
      endAt: at('2026-11-10T18:00:00Z'),
    },
    // On another place: ignored for the place, but the same coach.
    {
      id: 'hall',
      placeId: 'hall',
      coachPersonId: 'marek',
      startAt: at('2026-11-17T17:00:00Z'),
      endAt: at('2026-11-17T18:00:00Z'),
    },
    // Touching the candidate: no conflict.
    {
      id: 'after',
      placeId: 'pitch',
      coachPersonId: 'marek',
      startAt: at('2026-11-17T17:30:00Z'),
      endAt: at('2026-11-17T18:30:00Z'),
    },
  ]

  it('projects the place tree onto the candidate place and adds the coach', () => {
    expect(
      sessionConflicts({
        candidates,
        placeId: 'pitch',
        capacity: 1,
        relatedPlaceIds: ['orlik'],
        coachPersonId: 'marek',
        existing,
      }),
    ).toEqual([
      { key: '2026-11-10', kind: 'place', conflictingIds: ['complex'] },
      { key: '2026-11-17', kind: 'coach', conflictingIds: ['hall'] },
    ])
  })

  it('respects the capacity, skips the coach check without a coach and adds external blocks', () => {
    expect(
      sessionConflicts({
        candidates,
        placeId: 'pitch',
        capacity: 2,
        relatedPlaceIds: ['orlik'],
        coachPersonId: null,
        existing,
        external: [
          { id: 'closure', placeId: 'pitch', start: at('2026-11-10T15:00:00Z'), end: at('2026-11-10T17:15:00Z') },
          { id: 'elsewhere', placeId: 'hall', start: at('2026-11-17T15:00:00Z'), end: at('2026-11-17T20:00:00Z') },
        ],
      }),
    ).toEqual([{ key: '2026-11-10', kind: 'place', conflictingIds: ['closure', 'complex'] }])
  })
})

describe('the cancellation audience', () => {
  const audience = {
    roster: [
      { personId: 'jas', role: 'participant' as const },
      { personId: 'ola', role: 'participant' as const },
      { personId: 'adult', role: 'participant' as const },
      { personId: 'unknown-age', role: 'participant' as const },
      { personId: 'assistant', role: 'assistant' as const },
    ],
    coachPersonId: 'marek',
    birthDates: new Map<string, string | null>([
      ['jas', '2017-05-01'],
      ['ola', '2012-05-01'],
      ['adult', '2000-01-01'],
      ['unknown-age', null],
    ]),
    guardiansByWard: new Map<string, string[]>([
      ['jas', ['kasia']],
      ['ola', ['kasia', 'piotr']],
      ['adult', ['parent-of-adult']],
    ]),
    onDate: '2026-11-10',
  }

  it('names participants, the guardians of minors and the coaches', () => {
    expect(cancellationPersonIds(audience)).toEqual([
      'adult',
      'assistant',
      'jas',
      'kasia',
      'marek',
      'ola',
      'piotr',
      'unknown-age',
    ])
    expect(cancellationPersonIds({ ...audience, coachPersonId: null, roster: [] })).toEqual([])
  })

  it('notifies only accounts and never the user who cancelled', () => {
    const userIds = new Map([
      ['kasia', 'user-kasia'],
      ['ola', 'user-ola'],
      ['marek', 'user-marek'],
      ['adult', 'user-adult'],
      ['coordinator', 'user-coordinator'],
    ])
    expect(cancellationRecipients({ ...audience, userIds, actorUserId: 'user-marek' })).toEqual([
      'user-adult',
      'user-kasia',
      'user-ola',
    ])
    expect(cancellationRecipients({ ...audience, userIds, actorUserId: null })).toContain('user-marek')
  })
})

describe('activities error codes', () => {
  it('declares unique codes with message keys of the module', () => {
    const codes = errorCodes.map((entry) => entry.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).toContain('occurrence_place_conflict')
    for (const entry of errorCodes) expect(entry.messageKey).toBe(`activities.errors.${entry.code}`)
  })
})

describe('isPinnedSession', () => {
  it('pins a session the club acted on: cancelled, done or with checked-off attendance (#33)', () => {
    expect(isPinnedSession('planned', false)).toBe(false)
    expect(isPinnedSession('planned', true)).toBe(true)
    expect(isPinnedSession('done', false)).toBe(true)
    expect(isPinnedSession('cancelled', false)).toBe(true)
  })
})
