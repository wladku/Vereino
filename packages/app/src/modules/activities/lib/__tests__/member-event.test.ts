import { describe, expect, it } from '@jest/globals'
import {
  EVENT_NAME_MAX,
  gatheringMinutes,
  locationProblems,
  locationVenue,
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
  name: '  Turniej o Puchar Przykładu ',
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
        { id: 'p-5', name: 'Basen', parentName: null, isLeaf: true, isExternal: false },
        { id: 'p-4', name: 'Basen', parentName: null, isLeaf: true, isExternal: true },
      ]),
    ).toEqual([
      { id: 'p-4', label: 'Basen', isExternal: true },
      { id: 'p-5', label: 'Basen', isExternal: false },
      { id: 'p-1', label: 'Kompleks › Boisko A', isExternal: false },
      { id: 'p-2', label: 'Kompleks › Boisko B', isExternal: false },
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
        type: 'training',
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
      name: 'Turniej o Puchar Przykładu',
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

describe('the declaration deadline of the phone form (REQ-A07)', () => {
  it('sends whole hours as minutes when the type takes a deadline', () => {
    expect(eventRequestBody({ ...draft, confirmByHours: ' 48 ' }, 'Europe/Warsaw')).toMatchObject({
      confirmByMinutesBefore: 2880,
    })
  })

  it('sends no deadline when it is empty, invalid or the type takes none', () => {
    expect(eventRequestBody({ ...draft, confirmByHours: '' }, 'Europe/Warsaw')).not.toHaveProperty(
      'confirmByMinutesBefore',
    )
    expect(eventRequestBody(draft, 'Europe/Warsaw')).not.toHaveProperty('confirmByMinutesBefore')
    expect(eventRequestBody({ ...draft, confirmByHours: '24' }, 'Europe/Warsaw', false)).not.toHaveProperty(
      'confirmByMinutesBefore',
    )
  })

  it('reports hours outside 1–336 or not whole as invalid', () => {
    expect(eventDraftProblems({ ...draft, confirmByHours: '0' })).toEqual({ confirmByHours: 'invalid' })
    expect(eventDraftProblems({ ...draft, confirmByHours: '337' })).toEqual({ confirmByHours: 'invalid' })
    expect(eventDraftProblems({ ...draft, confirmByHours: '1.5' })).toEqual({ confirmByHours: 'invalid' })
    expect(eventDraftProblems({ ...draft, confirmByHours: '336' })).toEqual({})
    expect(eventDraftProblems({ ...draft, confirmByHours: '  ' })).toEqual({})
  })

  it('points the deadline refusals at the field', () => {
    expect(eventFieldOfError('occurrence_confirm_by_in_past')).toBe('confirmByHours')
    expect(eventFieldOfError('occurrence_confirm_by_after_start')).toBe('confirmByHours')
    expect(eventFieldOfError('occurrence_confirm_by_too_early')).toBe('confirmByHours')
  })
})

describe('eventFieldOfError', () => {
  it('points a coded refusal at its field', () => {
    expect(eventFieldOfError('activity_type_requires_team')).toBe('type')
    expect(eventFieldOfError('event_type_not_allowed')).toBe('type')
    expect(eventFieldOfError('event_place_closed')).toBe('startTime')
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

// #270 (REQ-A08, Q-A25, DD-43): a typed venue, an opponent, "away" and a gathering time on the phone form.
describe('the typed venue, opponent and gathering time of the phone form (REQ-A08)', () => {
  const away: EventDraft = {
    ...draft,
    type: 'sparring',
    placeId: '',
    venueMode: 'venue',
    venueName: ' Stadion Wisły Brzezie ',
    venueAddress: ' ul. Sportowa 1, Zielony Las ',
    opponentExternalTeamId: 't-9',
    isAway: true,
    gatheringTime: '08:30',
    confirmByHours: '48',
  }

  it('accepts a sparring at a typed venue and sends the venue, the opponent, away and the gathering time', () => {
    expect(eventDraftProblems(away)).toEqual({})
    const body = eventRequestBody(away, 'Europe/Warsaw')
    expect(body).toMatchObject({
      type: 'sparring',
      venue: { name: 'Stadion Wisły Brzezie', address: 'ul. Sportowa 1, Zielony Las' },
      opponentExternalTeamId: 't-9',
      isAway: true,
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 2880,
    })
    expect(body).not.toHaveProperty('placeId')
  })

  it('sends no opponent for a tournament, and no away or gathering when they are not set', () => {
    const body = eventRequestBody({ ...draft, opponentExternalTeamId: 't-9', gatheringTime: ' ' }, 'Europe/Warsaw')
    expect(body).toMatchObject({ placeId: 'p-1' })
    expect(body).not.toHaveProperty('opponentExternalTeamId')
    expect(body).not.toHaveProperty('isAway')
    expect(body).not.toHaveProperty('gatheringMinutesBefore')
    expect(eventRequestBody({ ...away, opponentExternalTeamId: '' }, 'Europe/Warsaw')).not.toHaveProperty(
      'opponentExternalTeamId',
    )
  })

  it('checks the venue name and address against their limits', () => {
    expect(eventDraftProblems({ ...away, venueName: ' ', venueAddress: undefined })).toEqual({
      venueName: 'required',
      venueAddress: 'required',
    })
    expect(eventDraftProblems({ ...away, venueName: 'X', venueAddress: 'ul.' })).toEqual({
      venueName: 'invalid',
      venueAddress: 'invalid',
    })
    expect(eventDraftProblems({ ...away, venueName: 'x'.repeat(121), venueAddress: 'x'.repeat(301) })).toEqual({
      venueName: 'invalid',
      venueAddress: 'invalid',
    })
  })

  it('asks for a club place only in the place mode', () => {
    expect(locationProblems({ venueMode: 'place', placeId: '' })).toEqual({ placeId: 'required' })
    expect(locationProblems({ placeId: 'p-1' })).toEqual({})
    expect(locationVenue({ venueMode: 'place', venueName: 'A', venueAddress: 'B' })).toBeNull()
    expect(locationVenue({ venueMode: 'venue' })).toEqual({ name: '', address: '' })
  })

  it('turns a gathering wall time into minutes before the start', () => {
    expect(gatheringMinutes(undefined, '09:00')).toBeNull()
    expect(gatheringMinutes('', '09:00')).toBeNull()
    expect(gatheringMinutes('08:15', '09:00')).toBe(45)
    expect(gatheringMinutes('21:00', '09:00')).toBe('invalid')
    expect(gatheringMinutes('09:00', '09:00')).toBe('invalid')
    expect(gatheringMinutes('8', '09:00')).toBe('invalid')
    expect(gatheringMinutes('08:00', '')).toBe('invalid')
    expect(gatheringMinutes('00:00', '12:00')).toBe(720)
    expect(gatheringMinutes('00:00', '12:01')).toBe('invalid')
    expect(eventDraftProblems({ ...away, gatheringTime: '10:00' })).toEqual({ gatheringTime: 'invalid' })
  })

  it('points the venue and gathering refusals at their fields', () => {
    expect(eventFieldOfError('venue_or_place_required')).toBe('placeId')
    expect(eventFieldOfError('occurrence_gathering_after_start')).toBe('gatheringTime')
    expect(eventFieldOfError('occurrence_gathering_too_early')).toBe('gatheringTime')
  })
})
