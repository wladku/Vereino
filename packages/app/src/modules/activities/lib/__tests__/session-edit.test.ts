import { describe, expect, it } from '@jest/globals'
import {
  sessionEditBody,
  sessionEditDraft,
  sessionEditFieldOfError,
  sessionEditProblems,
  sessionEditRefusal,
  sessionEditRefusalOfCode,
  type EditableSession,
} from '../session-edit'

const ZONE = 'Europe/Warsaw'

// #270 (REQ-A08, J-A02): Saturday 09:00–10:30 in Warsaw (CET, UTC+1), gathering 08:30, confirm by Thursday 12:00.
const atVenue: EditableSession = {
  startAt: '2026-11-21T08:00:00.000Z',
  endAt: '2026-11-21T09:30:00.000Z',
  placeId: null,
  venue: { name: 'Stadion Wisły Brzezie', address: 'ul. Sportowa 1, Zielony Las' },
  gatheringAt: '2026-11-21T07:30:00.000Z',
  confirmBy: '2026-11-19T11:00:00.000Z',
}
const atPlace: EditableSession = {
  ...atVenue,
  placeId: 'p-1',
  venue: null,
  gatheringAt: null,
  confirmBy: null,
}

describe('sessionEditDraft', () => {
  it('reads a session at a typed venue in the club zone', () => {
    expect(sessionEditDraft(atVenue, ZONE)).toEqual({
      date: '2026-11-21',
      startTime: '09:00',
      endTime: '10:30',
      venueMode: 'venue',
      placeId: '',
      venueName: 'Stadion Wisły Brzezie',
      venueAddress: 'ul. Sportowa 1, Zielony Las',
      gatheringTime: '08:30',
      confirmByDate: '2026-11-19',
      confirmByTime: '12:00',
    })
  })

  it('reads a session at a club place without a gathering time or a deadline', () => {
    expect(sessionEditDraft(atPlace, ZONE)).toMatchObject({
      venueMode: 'place',
      placeId: 'p-1',
      venueName: '',
      venueAddress: '',
      gatheringTime: '',
      confirmByDate: '',
      confirmByTime: '',
    })
  })
})

describe('sessionEditProblems', () => {
  const draft = sessionEditDraft(atVenue, ZONE)

  it('finds nothing in the session as it is', () => {
    expect(sessionEditProblems(draft, true)).toEqual({})
  })

  it('names missing and malformed fields', () => {
    expect(
      sessionEditProblems({ ...draft, date: '', startTime: '', endTime: '', venueName: '', gatheringTime: '7' }, true),
    ).toEqual({
      date: 'required',
      startTime: 'required',
      endTime: 'required',
      venueName: 'required',
      gatheringTime: 'invalid',
    })
    expect(sessionEditProblems({ ...draft, date: '2026-02-30', startTime: '9', endTime: '25:00' }, true)).toEqual({
      date: 'invalid',
      startTime: 'invalid',
      endTime: 'invalid',
      gatheringTime: 'invalid',
    })
  })

  it('refuses an end at or before the start', () => {
    expect(sessionEditProblems({ ...draft, endTime: '09:00' }, true)).toEqual({ endTime: 'endBeforeStart' })
  })

  it('asks for a place in the place mode', () => {
    expect(sessionEditProblems({ ...draft, venueMode: 'place', placeId: '' }, true)).toEqual({ placeId: 'required' })
  })

  it('checks the deadline only when the form shows it', () => {
    expect(sessionEditProblems({ ...draft, confirmByTime: '' }, true)).toEqual({ confirmByTime: 'incomplete' })
    expect(sessionEditProblems({ ...draft, confirmByDate: ' ' }, true)).toEqual({ confirmByDate: 'incomplete' })
    expect(sessionEditProblems({ ...draft, confirmByDate: '2026-13-01' }, true)).toEqual({
      confirmByDate: 'invalid',
    })
    expect(sessionEditProblems({ ...draft, confirmByTime: '7' }, true)).toEqual({ confirmByTime: 'invalid' })
    expect(sessionEditProblems({ ...draft, confirmByDate: '', confirmByTime: '' }, true)).toEqual({})
    expect(sessionEditProblems({ ...draft, confirmByTime: '' }, false)).toEqual({})
  })
})

describe('sessionEditBody', () => {
  const initial = sessionEditDraft(atVenue, ZONE)

  it('sends only the instants when nothing else changed', () => {
    expect(sessionEditBody(initial, initial, atVenue, ZONE)).toEqual({
      startAt: '2026-11-21T08:00:00.000Z',
      endAt: '2026-11-21T09:30:00.000Z',
    })
  })

  it('sends a changed venue, gathering time and deadline', () => {
    expect(
      sessionEditBody(
        {
          ...initial,
          startTime: '10:00',
          endTime: '11:30',
          venueName: ' Orlik Zielony Las ',
          gatheringTime: '09:15',
          confirmByDate: '2026-11-20',
          confirmByTime: '18:00',
        },
        initial,
        atVenue,
        ZONE,
      ),
    ).toEqual({
      startAt: '2026-11-21T09:00:00.000Z',
      endAt: '2026-11-21T10:30:00.000Z',
      venue: { name: 'Orlik Zielony Las', address: 'ul. Sportowa 1, Zielony Las' },
      gatheringAt: '2026-11-21T08:15:00.000Z',
      confirmBy: '2026-11-20T17:00:00.000Z',
    })
  })

  it('moves a typed venue to a club place and clears the gathering time and the deadline', () => {
    expect(
      sessionEditBody(
        { ...initial, venueMode: 'place', placeId: 'p-2', gatheringTime: '', confirmByDate: '', confirmByTime: '' },
        initial,
        atVenue,
        ZONE,
      ),
    ).toMatchObject({ placeId: 'p-2', gatheringAt: null, confirmBy: null })
  })

  it('sends a club place only when it changed, and a venue for a session at a club place', () => {
    const fromPlace = sessionEditDraft(atPlace, ZONE)
    expect(sessionEditBody(fromPlace, fromPlace, atPlace, ZONE)).not.toHaveProperty('placeId')
    expect(sessionEditBody({ ...fromPlace, placeId: 'p-3' }, fromPlace, atPlace, ZONE)).toMatchObject({
      placeId: 'p-3',
    })
    expect(
      sessionEditBody(
        { ...fromPlace, venueMode: 'venue', venueName: 'Hala', venueAddress: 'ul. Długa 2' },
        fromPlace,
        atPlace,
        ZONE,
      ),
    ).toMatchObject({ venue: { name: 'Hala', address: 'ul. Długa 2' } })
    expect(sessionEditBody({ ...initial, venueAddress: 'ul. Polna 3, Zielony Las' }, initial, atVenue, ZONE)).toMatchObject({
      venue: { name: 'Stadion Wisły Brzezie', address: 'ul. Polna 3, Zielony Las' },
    })
  })

  it('keeps a multi-day span when the date moves', () => {
    const camp = { ...atPlace, endAt: '2026-11-23T09:30:00.000Z' }
    const draft = sessionEditDraft(camp, ZONE)
    expect(sessionEditBody({ ...draft, date: '2026-11-28' }, draft, camp, ZONE)).toMatchObject({
      startAt: '2026-11-28T08:00:00.000Z',
      endAt: '2026-11-30T09:30:00.000Z',
    })
  })
})

describe('sessionEditFieldOfError', () => {
  it('points a coded refusal at its field', () => {
    expect(sessionEditFieldOfError('activity_times_inverted')).toBe('endTime')
    expect(sessionEditFieldOfError('venue_or_place_required')).toBe('placeId')
    expect(sessionEditFieldOfError('venue_requires_one_off')).toBe('placeId')
    expect(sessionEditFieldOfError('place_not_bookable')).toBe('placeId')
    expect(sessionEditFieldOfError('occurrence_gathering_too_early')).toBe('gatheringTime')
    expect(sessionEditFieldOfError('occurrence_gathering_after_start')).toBe('gatheringTime')
    expect(sessionEditFieldOfError('occurrence_confirm_by_in_past')).toBe('confirmByTime')
    expect(sessionEditFieldOfError('occurrence_confirm_by_after_start')).toBe('confirmByTime')
    expect(sessionEditFieldOfError('occurrence_confirm_by_too_early')).toBe('confirmByTime')
  })

  it('answers null without a code or for a code no field owns', () => {
    expect(sessionEditFieldOfError(null)).toBeNull()
    expect(sessionEditFieldOfError('coach_edit_series_session')).toBeNull()
  })
})

describe('sessionEditRefusal (E20-S10, #489)', () => {
  const ok = { status: 'ok' as const, mayEdit: true, planned: true, partOfClubEvent: false, as: 'coach' as const }

  it('shows the form for a planned session the caller may edit', () => {
    expect(sessionEditRefusal(ok)).toBeNull()
  })

  it('names a session outside the caller’s groups and sections', () => {
    expect(sessionEditRefusal({ status: 'forbidden' })).toBe('not_yours')
    expect(sessionEditRefusal({ ...ok, mayEdit: false, as: 'coordinator' })).toBe('not_yours')
  })

  it('names a session that is no longer planned before anything else', () => {
    expect(sessionEditRefusal({ ...ok, planned: false })).toBe('not_planned')
    expect(sessionEditRefusal({ ...ok, planned: false, mayEdit: false, partOfClubEvent: true })).toBe('not_planned')
  })

  it('sends a part session to the club event and a coach’s series session to the coordinator', () => {
    expect(sessionEditRefusal({ ...ok, mayEdit: false, partOfClubEvent: true })).toBe('club_event_part')
    expect(sessionEditRefusal({ ...ok, mayEdit: false })).toBe('coach_series')
  })

  it('maps the coded 403 of a save to the same reasons', () => {
    expect(sessionEditRefusalOfCode('coach_edit_series_session')).toBe('coach_series')
    expect(sessionEditRefusalOfCode('club_event_part_managed_by_event')).toBe('club_event_part')
    expect(sessionEditRefusalOfCode('scope_denied')).toBe('not_yours')
    expect(sessionEditRefusalOfCode(null)).toBe('not_yours')
  })
})
