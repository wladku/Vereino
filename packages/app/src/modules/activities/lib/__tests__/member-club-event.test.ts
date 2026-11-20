import { describe, expect, it } from '@jest/globals'
import {
  NO_GROUP,
  WHOLE_CLUB,
  clubEventDraft,
  clubEventDraftProblems,
  clubEventFieldOfError,
  clubEventRequestBody,
  partDayInZone,
  partDraft,
  partDraftProblems,
  partFieldOfError,
  partRequestBody,
  partTimeRangeInZone,
  wholeNumberIn,
  type ClubEventDraft,
  type PartDraft,
  type StoredPart,
} from '../member-club-event'

const ZONE = 'Europe/Warsaw'

// J-T01 (#380): Wojtek's "GWIAZDA CUP 2026" and its Orlik młodszy part, Saturday 21.11 09:00–14:00 in Warsaw (UTC+1),
// gathering 08:30, confirm by Thursday 19.11 09:00.
const stored = {
  name: 'GWIAZDA CUP 2026',
  publicSlug: 'gwiazda-cup-2026',
  sectionId: 's-academy',
  placeId: 'p-hall',
  description: 'Halowy turniej piłki nożnej',
  isPublic: false,
  gatheringMinutesBefore: 30,
  confirmByMinutesBefore: 2880,
}
const groupPart: StoredPart = {
  kind: 'group',
  title: 'Turniej Orlika Młodszego',
  categoryLabel: 'Orlik młodszy',
  type: 'tournament',
  groupId: 'g-orlik',
  startAt: '2026-11-21T08:00:00.000Z',
  endAt: '2026-11-21T13:00:00.000Z',
  coachPersonId: 'p-wojtek',
  gatheringAt: '2026-11-21T07:30:00.000Z',
  confirmBy: '2026-11-19T08:00:00.000Z',
  visitingTeamIds: ['t-wisla', 't-orzel'],
}
const openPart: StoredPart = {
  ...groupPart,
  kind: 'open',
  title: 'Turniej Drużyn – Seniorzy (16+)',
  categoryLabel: null,
  groupId: null,
  coachPersonId: null,
  gatheringAt: null,
  confirmBy: null,
  visitingTeamIds: [],
}

describe('wholeNumberIn', () => {
  it('reads a whole number in range, an empty text as null and anything else as invalid', () => {
    expect(wholeNumberIn(' 30 ', 720)).toBe(30)
    expect(wholeNumberIn('   ', 720)).toBeNull()
    expect(wholeNumberIn('0', 720)).toBe('invalid')
    expect(wholeNumberIn('721', 720)).toBe('invalid')
    expect(wholeNumberIn('1.5', 720)).toBe('invalid')
  })
})

describe('clubEventDraft', () => {
  it('preselects the caller’s only section, "Whole club" for the administrator, none among several', () => {
    expect(clubEventDraft(null, { wholeClub: false, sections: [{ id: 's-academy' }] }).sectionId).toBe('s-academy')
    expect(clubEventDraft(null, { wholeClub: true, sections: [{ id: 's-academy' }] }).sectionId).toBe(WHOLE_CLUB)
    expect(clubEventDraft(null, { wholeClub: false, sections: [{ id: 'a' }, { id: 'b' }] })).toEqual({
      name: '',
      publicSlug: '',
      sectionId: '',
      placeId: '',
      description: '',
      isPublic: false,
      gatheringMinutes: '',
      confirmByHours: '',
    })
  })

  it('reads a stored event, a whole-club one and one without texts or defaults', () => {
    const options = { wholeClub: false, sections: [] }
    expect(clubEventDraft(stored, options)).toEqual({
      name: 'GWIAZDA CUP 2026',
      publicSlug: 'gwiazda-cup-2026',
      sectionId: 's-academy',
      placeId: 'p-hall',
      description: 'Halowy turniej piłki nożnej',
      isPublic: false,
      gatheringMinutes: '30',
      confirmByHours: '48',
    })
    expect(
      clubEventDraft(
        {
          ...stored,
          name: null,
          publicSlug: null,
          sectionId: null,
          placeId: null,
          description: null,
          gatheringMinutesBefore: null,
          confirmByMinutesBefore: null,
        },
        options,
      ),
    ).toMatchObject({
      name: '',
      publicSlug: '',
      sectionId: WHOLE_CLUB,
      placeId: '',
      gatheringMinutes: '',
      confirmByHours: '',
    })
  })
})

describe('clubEventDraftProblems and clubEventRequestBody', () => {
  const draft: ClubEventDraft = clubEventDraft(stored, { wholeClub: false, sections: [] })

  it('accepts a complete draft and builds its body', () => {
    expect(clubEventDraftProblems(draft)).toEqual({})
    expect(clubEventRequestBody({ ...draft, name: ' GWIAZDA CUP 2026 ', publicSlug: ' gwiazda-cup-2026 ' })).toEqual({
      name: 'GWIAZDA CUP 2026',
      publicSlug: 'gwiazda-cup-2026',
      sectionId: 's-academy',
      placeId: 'p-hall',
      description: 'Halowy turniej piłki nożnej',
      isPublic: false,
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 2880,
    })
  })

  it('leaves out an empty slug, sends a whole-club event as null and blanks as null', () => {
    expect(
      clubEventRequestBody({
        ...draft,
        publicSlug: '',
        sectionId: WHOLE_CLUB,
        description: '  ',
        isPublic: true,
        gatheringMinutes: '',
        confirmByHours: '',
      }),
    ).toEqual({
      name: 'GWIAZDA CUP 2026',
      sectionId: null,
      placeId: 'p-hall',
      description: null,
      isPublic: true,
      gatheringMinutesBefore: null,
      confirmByMinutesBefore: null,
    })
  })

  it('names every field that keeps the form from sending', () => {
    expect(
      clubEventDraftProblems({
        ...draft,
        name: ' ',
        publicSlug: 'Gwiazda Cup',
        sectionId: '',
        placeId: '',
        description: 'x'.repeat(4001),
        gatheringMinutes: '0',
        confirmByHours: '337',
      }),
    ).toEqual({
      name: 'required',
      publicSlug: 'invalid',
      sectionId: 'required',
      placeId: 'required',
      description: 'invalid',
      gatheringMinutes: 'invalid',
      confirmByHours: 'invalid',
    })
    expect(clubEventDraftProblems({ ...draft, name: 'G' }).name).toBe('invalid')
    expect(clubEventDraftProblems({ ...draft, name: 'G'.repeat(161) }).name).toBe('invalid')
  })

  it('points a coded refusal at its field', () => {
    expect(clubEventFieldOfError('club_event_slug_taken')).toBe('publicSlug')
    expect(clubEventFieldOfError('scope_denied')).toBe('sectionId')
    expect(clubEventFieldOfError('club_event_open_part_needs_external_place')).toBe('placeId')
    expect(clubEventFieldOfError('something_else')).toBeNull()
    expect(clubEventFieldOfError(null)).toBeNull()
  })
})

describe('partDraft', () => {
  it('starts a new part with the event’s default gathering and deadline', () => {
    expect(partDraft({ kind: 'create', event: stored }, ZONE)).toEqual({
      title: '',
      date: '',
      startTime: '',
      endTime: '',
      groupId: '',
      categoryLabel: '',
      type: 'tournament',
      coachPersonId: '',
      gatheringMinutes: '30',
      confirmByHours: '48',
      visitingTeamIds: [],
    })
    expect(
      partDraft({ kind: 'create', event: { gatheringMinutesBefore: null, confirmByMinutesBefore: null } }, ZONE),
    ).toMatchObject({ gatheringMinutes: '', confirmByHours: '' })
  })

  it('reads a stored part in the club zone, and an open part without session offsets', () => {
    expect(partDraft({ kind: 'edit', part: groupPart }, ZONE)).toEqual({
      title: 'Turniej Orlika Młodszego',
      date: '2026-11-21',
      startTime: '09:00',
      endTime: '14:00',
      groupId: 'g-orlik',
      categoryLabel: 'Orlik młodszy',
      type: 'tournament',
      coachPersonId: 'p-wojtek',
      gatheringMinutes: '30',
      confirmByHours: '48',
      visitingTeamIds: ['t-wisla', 't-orzel'],
    })
    expect(partDraft({ kind: 'edit', part: openPart }, ZONE)).toMatchObject({
      groupId: NO_GROUP,
      categoryLabel: '',
      coachPersonId: '',
      gatheringMinutes: '',
      confirmByHours: '',
    })
  })

  it('copies everything but the day, the group and the coach', () => {
    const copy = partDraft({ kind: 'copy', part: groupPart }, ZONE)
    expect(copy).toMatchObject({ date: '', groupId: '', coachPersonId: '', startTime: '09:00', endTime: '14:00' })
    expect(copy.visitingTeamIds).not.toBe(groupPart.visitingTeamIds)
  })

  it('reads a part without times or with a broken instant as empty times', () => {
    const draft = partDraft({ kind: 'edit', part: { ...openPart, startAt: null, endAt: 'not a date' } }, ZONE)
    expect(draft).toMatchObject({ date: '', startTime: '', endTime: '' })
  })
})

describe('partDraftProblems', () => {
  const create = { editing: false, fixedTimes: false }
  const complete: PartDraft = { ...partDraft({ kind: 'edit', part: groupPart }, ZONE) }

  it('accepts a complete draft', () => {
    expect(partDraftProblems(complete, create)).toEqual({})
  })

  it('names the missing and malformed fields of a new part', () => {
    expect(
      partDraftProblems(
        {
          ...complete,
          title: '',
          date: '',
          startTime: '',
          endTime: '9',
          groupId: '',
          categoryLabel: 'x'.repeat(61),
          type: '',
          gatheringMinutes: 'x',
          confirmByHours: '0',
        },
        create,
      ),
    ).toEqual({
      title: 'required',
      date: 'required',
      startTime: 'required',
      endTime: 'invalid',
      groupId: 'required',
      categoryLabel: 'invalid',
      type: 'required',
      gatheringMinutes: 'invalid',
      confirmByHours: 'invalid',
    })
    expect(
      partDraftProblems({ ...complete, title: 'x', date: '2026-13-40', type: 'training', endTime: '08:00' }, create),
    ).toEqual({ title: 'invalid', date: 'invalid', type: 'invalid', endTime: 'endBeforeStart' })
  })

  it('skips the fixed day and times and the fixed group of a stored part with a group', () => {
    expect(
      partDraftProblems(
        { ...complete, date: '', startTime: '', endTime: '', groupId: '' },
        { editing: true, fixedTimes: true },
      ),
    ).toEqual({})
  })
})

describe('partRequestBody', () => {
  const draft = partDraft({ kind: 'edit', part: groupPart }, ZONE)

  it('builds a new part with a group: instants of the club zone, group, coach, gathering and deadline', () => {
    expect(
      partRequestBody(
        { ...draft, title: ' Turniej Orlika Młodszego ', visitingTeamIds: ['t-wisla', 't-wisla', 't-orzel'] },
        { editing: false, fixedTimes: false, timeZone: ZONE, groupPart: true, deadlineShown: true },
      ),
    ).toEqual({
      title: 'Turniej Orlika Młodszego',
      categoryLabel: 'Orlik młodszy',
      type: 'tournament',
      visitingTeamIds: ['t-wisla', 't-orzel'],
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 2880,
      startsAt: '2026-11-21T08:00:00.000Z',
      endsAt: '2026-11-21T13:00:00.000Z',
      groupId: 'g-orlik',
      coachPersonId: 'p-wojtek',
    })
  })

  it('leaves out the deadline the club does not ask for, an empty coach and empty offsets', () => {
    expect(
      partRequestBody(
        { ...draft, coachPersonId: '', gatheringMinutes: '' },
        { editing: false, fixedTimes: false, timeZone: ZONE, groupPart: true, deadlineShown: false },
      ),
    ).toMatchObject({ gatheringMinutesBefore: null, confirmByMinutesBefore: null, groupId: 'g-orlik' })
    expect(
      partRequestBody(
        { ...draft, coachPersonId: '' },
        { editing: false, fixedTimes: false, timeZone: ZONE, groupPart: true, deadlineShown: false },
      ),
    ).not.toHaveProperty('coachPersonId')
  })

  it('builds a new open part: no group, no coach, no session offsets', () => {
    const body = partRequestBody(
      { ...draft, groupId: NO_GROUP, categoryLabel: ' ' },
      { editing: false, fixedTimes: false, timeZone: ZONE, groupPart: false, deadlineShown: true },
    )
    expect(body).toMatchObject({ groupId: null, categoryLabel: null })
    expect(body).not.toHaveProperty('coachPersonId')
    expect(body).not.toHaveProperty('gatheringMinutesBefore')
    expect(body).not.toHaveProperty('confirmByMinutesBefore')
  })

  it('changes a stored part with a group without its times, group or coach', () => {
    const body = partRequestBody(draft, {
      editing: true,
      fixedTimes: true,
      timeZone: ZONE,
      groupPart: true,
      deadlineShown: true,
    })
    expect(body).not.toHaveProperty('startsAt')
    expect(body).not.toHaveProperty('groupId')
    expect(body).not.toHaveProperty('coachPersonId')
  })
})

describe('partFieldOfError', () => {
  it('points a coded refusal or a bad reference at its field', () => {
    expect(partFieldOfError('club_event_part_outside_section')).toBe('groupId')
    expect(partFieldOfError('event_place_closed')).toBe('startTime')
    expect(partFieldOfError('occurrence_confirm_by_in_past')).toBe('confirmByHours')
    expect(partFieldOfError('activities_reference_invalid', 'visitingTeamIds')).toBe('visitingTeamIds')
    expect(partFieldOfError('activities_reference_invalid', 'placeId')).toBeNull()
    expect(partFieldOfError('activities_reference_invalid', 7)).toBeNull()
    expect(partFieldOfError('something_else')).toBeNull()
    expect(partFieldOfError(null)).toBeNull()
  })
})

describe('partDayInZone and partTimeRangeInZone', () => {
  it('reads the club-zone day and wall times of a part', () => {
    expect(partDayInZone(groupPart.startAt, ZONE)).toBe('2026-11-21')
    expect(partDayInZone(null, ZONE)).toBe('')
    expect(partDayInZone(undefined, ZONE)).toBe('')
    expect(partTimeRangeInZone(groupPart.startAt, groupPart.endAt, ZONE)).toBe('09:00–14:00')
    expect(partTimeRangeInZone(groupPart.startAt, null, ZONE)).toBe('09:00')
    expect(partTimeRangeInZone(undefined, groupPart.endAt, ZONE)).toBe('14:00')
  })
})
