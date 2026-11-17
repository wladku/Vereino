import { describe, expect, it } from '@jest/globals'
import { movedKinds, scheduleChangeOf, sessionChangeOf, type SeriesRule, type SessionFacts } from '../session-change'

const NOW = new Date('2026-11-17T12:00:00Z')

function session(overrides: Partial<SessionFacts> = {}): SessionFacts {
  return {
    status: 'planned',
    startAt: new Date('2026-11-18T16:00:00Z'),
    endAt: new Date('2026-11-18T17:30:00Z'),
    placeId: 'place-1',
    venueName: null,
    venueAddress: null,
    gatheringMinutesBefore: 30,
    ...overrides,
  }
}

const BEFORE = {
  startAt: '2026-11-18T16:00:00.000Z',
  endAt: '2026-11-18T17:30:00.000Z',
  placeId: 'place-1',
  venueName: null,
  gatheringMinutesBefore: 30,
}

describe('moved kinds (REQ-A09, glossary *Announced change*)', () => {
  it('names a changed start or end as time', () => {
    expect(movedKinds(session(), session({ startAt: new Date('2026-11-19T16:00:00Z') }))).toEqual(['time'])
    expect(movedKinds(session(), session({ endAt: new Date('2026-11-18T18:00:00Z') }))).toEqual(['time'])
  })

  it('names another place, a typed venue or another venue address as place', () => {
    expect(movedKinds(session(), session({ placeId: 'place-2' }))).toEqual(['place'])
    expect(movedKinds(session(), session({ placeId: null, venueName: 'Stadion', venueAddress: 'ul. 1' }))).toEqual([
      'place',
    ])
    expect(
      movedKinds(
        session({ placeId: null, venueName: 'Stadion', venueAddress: 'ul. 1' }),
        session({ placeId: null, venueName: 'Stadion', venueAddress: 'ul. 2' }),
      ),
    ).toEqual(['place'])
  })

  it('names a changed, added or removed gathering offset as gathering', () => {
    expect(movedKinds(session(), session({ gatheringMinutesBefore: 45 }))).toEqual(['gathering'])
    expect(movedKinds(session({ gatheringMinutesBefore: undefined }), session())).toEqual(['gathering'])
  })

  it('names nothing for the same facts (a coach or a deadline change)', () => {
    expect(movedKinds(session(), session())).toEqual([])
    expect(movedKinds(session({ venueName: undefined, venueAddress: undefined }), session())).toEqual([])
  })

  it('names several kinds in a fixed order', () => {
    expect(
      movedKinds(
        session(),
        session({ startAt: new Date('2026-11-19T16:00:00Z'), placeId: 'place-2', gatheringMinutesBefore: null }),
      ),
    ).toEqual(['time', 'place', 'gathering'])
  })
})

describe('the announced change of one session', () => {
  it('carries the kinds and the values before the move', () => {
    expect(sessionChangeOf(session(), session({ placeId: 'place-2' }), NOW)).toEqual({
      kinds: ['place'],
      before: BEFORE,
    })
  })

  it('fills absent optional facts with null', () => {
    const before = session({ venueName: undefined, gatheringMinutesBefore: undefined })
    expect(sessionChangeOf(before, session({ placeId: 'place-2', gatheringMinutesBefore: null }), NOW)?.before).toEqual(
      { ...BEFORE, gatheringMinutesBefore: null },
    )
  })

  it('announces nothing for a coach or deadline change alone', () => {
    expect(sessionChangeOf(session(), session(), NOW)).toBeNull()
  })

  it('announces a move of a past session to the future, and one from the future to the past', () => {
    const past = session({ startAt: new Date('2026-11-10T16:00:00Z'), endAt: new Date('2026-11-10T17:30:00Z') })
    expect(sessionChangeOf(past, session(), NOW)?.kinds).toEqual(['time'])
    expect(sessionChangeOf(session(), past, NOW)?.kinds).toEqual(['time'])
  })

  it('announces nothing when both starts are not later than the change', () => {
    const past = session({ startAt: NOW, endAt: new Date('2026-11-17T13:00:00Z') })
    expect(sessionChangeOf(past, { ...past, placeId: 'place-2' }, NOW)).toBeNull()
  })

  it('announces a restore of a cancelled session', () => {
    expect(sessionChangeOf(session({ status: 'cancelled' }), session(), NOW)).toEqual({
      kinds: ['restored'],
      before: BEFORE,
    })
  })

  it('announces nothing for a session that is not planned afterwards, or was done', () => {
    expect(sessionChangeOf(session(), session({ status: 'cancelled' }), NOW)).toBeNull()
    expect(sessionChangeOf(session({ status: 'done' }), session({ placeId: 'place-2' }), NOW)).toBeNull()
  })
})

describe('the series change notice (DD-A08)', () => {
  const rules: { before: SeriesRule; after: SeriesRule } = {
    before: { startTime: '17:00', endTime: '18:30', placeId: 'place-1', venueName: null, gatheringMinutesBefore: 30 },
    after: { startTime: '17:30', endTime: '19:00', placeId: 'place-1', venueName: null, gatheringMinutesBefore: 30 },
  }
  const later = (date: string) => ({
    occurrenceDate: date,
    before: session({ startAt: new Date(`${date}T16:00:00Z`), endAt: new Date(`${date}T17:30:00Z`) }),
    after: session({ startAt: new Date(`${date}T16:30:00Z`), endAt: new Date(`${date}T18:00:00Z`) }),
  })

  it('names the first changed date, the number of changed sessions and both rules', () => {
    const coachOnly = { occurrenceDate: '2026-11-18', before: session(), after: session() }
    expect(scheduleChangeOf([later('2026-12-02'), coachOnly, later('2026-11-25')], rules, NOW)).toEqual({
      from: '2026-11-25',
      movedCount: 2,
      ...rules,
    })
  })

  it('is null when no session changed in a way that is announced', () => {
    expect(scheduleChangeOf([], rules, NOW)).toBeNull()
    expect(scheduleChangeOf([{ occurrenceDate: '2026-11-18', before: session(), after: session() }], rules, NOW)).toBeNull()
  })
})
