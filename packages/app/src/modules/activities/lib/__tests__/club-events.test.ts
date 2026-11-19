import { describe, expect, it } from '@jest/globals'
import {
  MAX_PARTS,
  PART_TYPES,
  clubEventDates,
  clubEventPublicPath,
  futurePlannedSessions,
  isClubEventSlug,
  openPartProblem,
  partCopyPrefill,
  partKind,
  partSectionProblem,
  partsLimitReached,
  proposeClubEventSlug,
  sectionChangeProblem,
} from '../club-events'

// Club events spec TEST-T15 (activities rules): slug, part kind, event dates, the open-part rule, the sessions a place
// change moves, the copy prefill.
describe('proposeClubEventSlug', () => {
  it('proposes a readable slug from the name', () => {
    expect(proposeClubEventSlug('GWIAZDA CUP 2026')).toBe('gwiazda-cup-2026')
    expect(proposeClubEventSlug('  Turniej Żaków — Łódź, Śląsk!  ')).toBe('turniej-zakow-lodz-slask')
  })

  it('cuts a long name to 80 characters without a trailing hyphen', () => {
    const slug = proposeClubEventSlug(`${'a'.repeat(79)} bcd`)
    expect(slug).toBe('a'.repeat(79))
  })

  it('answers null when too little is left', () => {
    expect(proposeClubEventSlug('!!')).toBeNull()
    expect(proposeClubEventSlug('Ab')).toBeNull()
  })
})

describe('isClubEventSlug', () => {
  it('accepts lower-case words joined by single hyphens, 3–80 characters', () => {
    expect(isClubEventSlug('gwiazda-cup-2026')).toBe(true)
    expect(isClubEventSlug('abc')).toBe(true)
  })

  it('refuses other shapes and lengths', () => {
    expect(isClubEventSlug('ab')).toBe(false)
    expect(isClubEventSlug('a'.repeat(81))).toBe(false)
    expect(isClubEventSlug('Gwiazda')).toBe(false)
    expect(isClubEventSlug('a--b')).toBe(false)
    expect(isClubEventSlug('-abc')).toBe(false)
  })
})

describe('part rules', () => {
  it('tells a part with a group from an open part', () => {
    expect(partKind({ activityId: 'a1' })).toBe('group')
    expect(partKind({ activityId: null })).toBe('open')
    expect(partKind({})).toBe('open')
  })

  it('allows an open part only at an external place', () => {
    expect(openPartProblem(false, false)).toBe('club_event_open_part_needs_external_place')
    expect(openPartProblem(false, true)).toBeNull()
    expect(openPartProblem(true, false)).toBeNull()
  })

  it('counts the 40 live parts', () => {
    expect(partsLimitReached(MAX_PARTS - 1)).toBe(false)
    expect(partsLimitReached(MAX_PARTS)).toBe(true)
  })

  it('keeps a part of a section event in that section', () => {
    expect(partSectionProblem(null, 's2')).toBeNull()
    expect(partSectionProblem('s1', 's1')).toBeNull()
    expect(partSectionProblem('s1', 's2')).toBe('club_event_part_outside_section')
  })

  it('fixes the section once the event has a part', () => {
    expect(sectionChangeProblem('s1', 's1', 3)).toBeNull()
    expect(sectionChangeProblem('s1', null, 0)).toBeNull()
    expect(sectionChangeProblem('s1', 's2', 1)).toBe('club_event_section_fixed')
  })

  it('offers the one-off event types', () => {
    expect(PART_TYPES).toEqual(['sparring', 'match', 'tournament', 'other'])
  })
})

describe('clubEventDates', () => {
  it('spans the first start to the last end in the club zone', () => {
    expect(
      clubEventDates(
        [
          { startAt: new Date('2026-11-29T08:00:00Z'), endAt: new Date('2026-11-29T11:30:00Z') },
          { startAt: new Date('2026-11-20T23:30:00Z'), endAt: new Date('2026-11-21T13:00:00Z') },
        ],
        'Europe/Warsaw',
      ),
    ).toEqual({ dateFrom: '2026-11-21', dateTo: '2026-11-29' })
  })

  it('has no dates without a part', () => {
    expect(clubEventDates([], 'Europe/Warsaw')).toBeNull()
  })
})

describe('futurePlannedSessions', () => {
  it('keeps only the planned sessions that start later', () => {
    const now = new Date('2026-11-20T10:00:00Z')
    const sessions = [
      { id: 'future', status: 'planned', startAt: new Date('2026-11-21T08:00:00Z') },
      { id: 'past', status: 'planned', startAt: new Date('2026-11-19T08:00:00Z') },
      { id: 'now', status: 'planned', startAt: now },
      { id: 'cancelled', status: 'cancelled', startAt: new Date('2026-11-22T08:00:00Z') },
      { id: 'done', status: 'done', startAt: new Date('2026-11-22T08:00:00Z') },
    ]
    expect(futurePlannedSessions(sessions, now).map((session) => session.id)).toEqual(['future'])
  })
})

describe('clubEventPublicPath', () => {
  it('links the tournament page only while the event is public and the club has a slug', () => {
    expect(clubEventPublicPath('gwiazda', 'gwiazda-cup-2026', true)).toBe('/p/gwiazda/events/gwiazda-cup-2026')
    expect(clubEventPublicPath('gwiazda', 'gwiazda-cup-2026', false)).toBeNull()
    expect(clubEventPublicPath(null, 'gwiazda-cup-2026', true)).toBeNull()
  })
})

describe('partCopyPrefill', () => {
  it('copies everything but the day and the group', () => {
    const teams = ['t1', 't2']
    const prefill = partCopyPrefill({
      title: 'Turniej Orlika Młodszego',
      categoryLabel: 'Orlik młodszy',
      type: 'tournament',
      startTime: '09:00',
      endTime: '14:00',
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 2880,
      visitingTeamIds: teams,
    })
    expect(prefill).toEqual({
      title: 'Turniej Orlika Młodszego',
      categoryLabel: 'Orlik młodszy',
      type: 'tournament',
      startTime: '09:00',
      endTime: '14:00',
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 2880,
      visitingTeamIds: ['t1', 't2'],
      date: null,
      groupId: null,
    })
    expect(prefill.visitingTeamIds).not.toBe(teams)
  })
})
