import { describe, expect, it } from '@jest/globals'
import {
  EVENT_NAME_MAX,
  eventDraftProblems,
  eventFieldOfError,
  eventGroupOptions,
  eventPlaceOptions,
  eventRequestBody,
  type EventDraft,
} from '../member-event'

const draft: EventDraft = {
  groupId: 'g-1',
  type: 'tournament',
  name: '  Turniej o Puchar Gwiazdy ',
  placeId: 'p-1',
  date: '2026-11-14',
  startTime: '09:00',
  endTime: '12:00',
  invitedExternalTeamIds: ['t-1', 't-2', 't-1'],
  description: '  Zbiórka przy szatni  ',
}

describe('eventGroupOptions', () => {
  it('keeps the active groups, names their section and sorts by section, name and id', () => {
    const sections = new Map([
      ['s-foot', 'Piłka nożna'],
      ['s-chess', 'Szachy'],
    ])
    expect(
      eventGroupOptions(
        [
          { id: 'g-3', name: 'Żaki', kind: 'team', sectionId: 's-foot', isActive: true },
          { id: 'g-2', name: 'Orliki', kind: 'team', sectionId: 's-foot', isActive: true },
          { id: 'g-1', name: 'Orliki', kind: 'team', sectionId: 's-foot', isActive: true },
          { id: 'g-4', name: 'Grupa A', kind: 'class_group', sectionId: 's-chess', isActive: true },
          { id: 'g-5', name: 'Bez sekcji', kind: 'team', sectionId: 's-gone', isActive: true },
          { id: 'g-6', name: 'Stara', kind: 'team', sectionId: 's-foot', isActive: false },
        ],
        sections,
      ),
    ).toEqual([
      { id: 'g-5', name: 'Bez sekcji', kind: 'team', sectionName: null },
      { id: 'g-1', name: 'Orliki', kind: 'team', sectionName: 'Piłka nożna' },
      { id: 'g-2', name: 'Orliki', kind: 'team', sectionName: 'Piłka nożna' },
      { id: 'g-3', name: 'Żaki', kind: 'team', sectionName: 'Piłka nożna' },
      { id: 'g-4', name: 'Grupa A', kind: 'class_group', sectionName: 'Szachy' },
    ])
  })

  it('answers an empty list for a person who coaches nothing', () => {
    expect(eventGroupOptions([], new Map())).toEqual([])
  })
})

describe('eventPlaceOptions', () => {
  it('keeps the leaves, names their parent and sorts by label and id', () => {
    expect(
      eventPlaceOptions([
        { id: 'p-3', name: 'Kompleks', parentName: null, isLeaf: false },
        { id: 'p-2', name: 'Boisko B', parentName: 'Kompleks', isLeaf: true },
        { id: 'p-1', name: 'Boisko A', parentName: 'Kompleks', isLeaf: true },
        { id: 'p-5', name: 'Basen', parentName: null, isLeaf: true },
        { id: 'p-4', name: 'Basen', parentName: null, isLeaf: true },
      ]),
    ).toEqual([
      { id: 'p-4', label: 'Basen' },
      { id: 'p-5', label: 'Basen' },
      { id: 'p-1', label: 'Kompleks › Boisko A' },
      { id: 'p-2', label: 'Kompleks › Boisko B' },
    ])
  })
})

describe('eventDraftProblems', () => {
  it('finds nothing in a complete draft', () => {
    expect(eventDraftProblems(draft)).toEqual({})
  })

  it('names every missing field', () => {
    expect(
      eventDraftProblems({
        ...draft,
        groupId: '',
        type: '',
        name: '   ',
        placeId: '',
        date: '',
        startTime: '',
        endTime: '',
      }),
    ).toEqual({
      groupId: 'required',
      type: 'required',
      name: 'required',
      placeId: 'required',
      date: 'required',
      startTime: 'required',
      endTime: 'required',
    })
  })

  it('refuses a type that is not a one-off event, a long name, an unreal date and malformed times', () => {
    expect(
      eventDraftProblems({
        ...draft,
        type: 'sparring',
        name: 'x'.repeat(EVENT_NAME_MAX + 1),
        date: '2026-02-30',
        startTime: '9',
        endTime: '25:00',
      }),
    ).toEqual({ type: 'invalid', name: 'invalid', date: 'invalid', startTime: 'invalid', endTime: 'invalid' })
  })

  it('refuses an end at or before the start', () => {
    expect(eventDraftProblems({ ...draft, endTime: '09:00' })).toEqual({ endTime: 'endBeforeStart' })
    expect(eventDraftProblems({ ...draft, endTime: '08:30' })).toEqual({ endTime: 'endBeforeStart' })
  })

  it('accepts the other type', () => {
    expect(eventDraftProblems({ ...draft, type: 'other' })).toEqual({})
  })
})

describe('eventRequestBody', () => {
  it('turns the club-zone wall times into instants and keeps the invited teams of a tournament once', () => {
    expect(eventRequestBody(draft, 'Europe/Warsaw')).toEqual({
      groupId: 'g-1',
      type: 'tournament',
      name: 'Turniej o Puchar Gwiazdy',
      placeId: 'p-1',
      startsAt: '2026-11-14T08:00:00.000Z',
      endsAt: '2026-11-14T11:00:00.000Z',
      invitedExternalTeamIds: ['t-1', 't-2'],
      description: 'Zbiórka przy szatni',
    })
  })

  it('sends no invited teams for another event and a blank note as null', () => {
    expect(eventRequestBody({ ...draft, type: 'other', description: '  ' }, 'Europe/Warsaw')).toMatchObject({
      type: 'other',
      invitedExternalTeamIds: [],
      description: null,
    })
  })
})

describe('eventFieldOfError', () => {
  it('points a coded refusal at its field', () => {
    expect(eventFieldOfError('activity_type_requires_team')).toBe('type')
    expect(eventFieldOfError('event_type_not_allowed')).toBe('type')
    expect(eventFieldOfError('activity_times_inverted')).toBe('endTime')
    expect(eventFieldOfError('activity_group_inactive')).toBe('groupId')
    expect(eventFieldOfError('place_not_bookable')).toBe('placeId')
  })

  it('reads the field of an invalid reference', () => {
    expect(eventFieldOfError('activities_reference_invalid', 'groupId')).toBe('groupId')
    expect(eventFieldOfError('activities_reference_invalid', 'placeId')).toBe('placeId')
    expect(eventFieldOfError('activities_reference_invalid', 'externalTeamIds')).toBeNull()
    expect(eventFieldOfError('activities_reference_invalid', 7)).toBeNull()
  })

  it('answers null without a code or for a code no field owns', () => {
    expect(eventFieldOfError(null)).toBeNull()
    expect(eventFieldOfError('scope_denied')).toBeNull()
  })
})
