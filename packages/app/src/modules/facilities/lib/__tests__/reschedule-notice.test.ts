import { describe, expect, it } from '@jest/globals'
import {
  RENTALS_TO_MOVE_HREF,
  RESCHEDULE_ENTRY_LIMIT,
  announcedBefore,
  isToMoveView,
  limitNoticeEntries,
  placeDayToMoveHref,
  planRescheduleNotices,
  rescheduleNoticeKey,
  sectionDays,
  type FlaggedBooking,
  type FlaggedRental,
  type FlaggedSession,
} from '../reschedule-notice'

const PLACE = '11111111-1111-4111-8111-111111111111'
const dayOf = (instant: Date) => instant.toISOString().slice(0, 10)

function session(id: string, start: string, extra: Partial<FlaggedSession> = {}): FlaggedSession {
  return {
    kind: 'session',
    id,
    placeId: PLACE,
    startsAt: new Date(start),
    endsAt: new Date(new Date(start).getTime() + 3_600_000),
    label: 'U10',
    sectionId: 'section-a',
    coachPersonId: 'coach',
    ...extra,
  }
}

const booking: FlaggedBooking = {
  kind: 'booking',
  id: 'booking-1',
  placeId: PLACE,
  startsAt: new Date('2026-11-20T15:00:00Z'),
  endsAt: new Date('2026-11-20T16:00:00Z'),
  label: null,
  bookedByPersonId: 'booker',
}

const rental: FlaggedRental = {
  kind: 'rental',
  id: 'rental-1',
  placeId: PLACE,
  startsAt: new Date('2026-11-20T18:00:00Z'),
  endsAt: new Date('2026-11-20T19:00:00Z'),
  label: null,
}

describe('reschedule notices (REQ-R18, J-R05)', () => {
  it('keys one message by cause, its save and the recipient', () => {
    const cause = { kind: 'closure' as const, id: 'c1', updatedAt: new Date(1_700_000_000_000), previous: null }
    expect(rescheduleNoticeKey(cause, 'p1')).toBe('facilities:reschedule:c1:1700000000000:p1')
  })

  it('sends one message per person listing their entries by start', () => {
    const notices = planRescheduleNotices({
      sessions: [session('s2', '2026-11-20T17:00:00Z'), session('s1', '2026-11-20T16:00:00Z')],
      bookings: [booking],
      rentals: [rental],
      admins: ['admin-1', 'admin-2'],
      coordinatorsOf: (sectionId, date) => (sectionId === 'section-a' && date === '2026-11-20' ? ['coordinator'] : []),
      dayOf,
    })
    const byPerson = new Map(notices.map((notice) => [notice.personId, notice]))
    expect([...byPerson.keys()].sort()).toEqual(['admin-1', 'admin-2', 'booker', 'coach', 'coordinator'])
    expect(byPerson.get('coordinator')).toEqual({
      personId: 'coordinator',
      audience: 'staff',
      entries: [
        expect.objectContaining({ kind: 'session', id: 's1' }),
        expect.objectContaining({ kind: 'session', id: 's2' }),
      ],
    })
    expect(byPerson.get('coach')?.entries.map((entry) => entry.id)).toEqual(['s1', 's2'])
    expect(byPerson.get('booker')).toMatchObject({ audience: 'staff', entries: [{ id: 'booking-1' }] })
    expect(byPerson.get('admin-1')).toMatchObject({ audience: 'admin', entries: [{ id: 'rental-1' }] })
    // Only the entry's fields: no section or coach leaves the plan.
    expect(byPerson.get('coach')?.entries[0]).not.toHaveProperty('coachPersonId')
  })

  it('folds a person in several roles into one administrators’ message and lists an entry once', () => {
    const notices = planRescheduleNotices({
      sessions: [session('s1', '2026-11-20T16:00:00Z', { coachPersonId: 'admin' })],
      bookings: [],
      rentals: [rental],
      admins: ['admin'],
      coordinatorsOf: () => ['admin'],
      dayOf,
    })
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ personId: 'admin', audience: 'admin' })
    expect(notices[0].entries.map((entry) => entry.id)).toEqual(['s1', 'rental-1'])
  })

  it('tells nobody about a session without a section or coach, and orders equal starts by id', () => {
    const start = '2026-11-20T16:00:00Z'
    expect(
      planRescheduleNotices({
        sessions: [session('s1', start, { sectionId: null, coachPersonId: null })],
        bookings: [],
        rentals: [],
        admins: [],
        coordinatorsOf: () => ['coordinator'],
        dayOf,
      }),
    ).toEqual([])
    const notices = planRescheduleNotices({
      sessions: [session('b', start), session('a', start)],
      bookings: [],
      rentals: [rental],
      admins: [],
      coordinatorsOf: () => [],
      dayOf,
    })
    expect(notices.map((notice) => notice.entries.map((entry) => entry.id))).toEqual([['a', 'b']])
  })

  it('reads each section once per day', () => {
    expect(
      sectionDays(
        [
          session('s1', '2026-11-20T16:00:00Z'),
          session('s2', '2026-11-20T18:00:00Z'),
          session('s3', '2026-11-21T16:00:00Z'),
          session('s4', '2026-11-21T16:00:00Z', { sectionId: null }),
        ],
        dayOf,
      ),
    ).toEqual([
      { sectionId: 'section-a', date: '2026-11-20' },
      { sectionId: 'section-a', date: '2026-11-21' },
    ])
  })

  it('leaves out what the cause announced under its previous window', () => {
    const previous = {
      sessionPlaceIds: new Set([PLACE]),
      familyIds: new Set([PLACE, 'parent']),
      start: new Date('2026-11-20T15:00:00Z'),
      end: new Date('2026-11-20T17:00:00Z'),
    }
    const s1 = session('s1', '2026-11-20T16:00:00Z')
    expect(announcedBefore(s1, null)).toBe(false)
    expect(announcedBefore(s1, previous)).toBe(true)
    // After the previous window, or before it.
    expect(announcedBefore(session('s2', '2026-11-20T17:00:00Z'), previous)).toBe(false)
    expect(announcedBefore(session('s0', '2026-11-20T14:00:00Z'), previous)).toBe(false)
    // A session on the parent place was not under the previous window; a rental there was.
    expect(announcedBefore({ ...s1, placeId: 'parent' }, previous)).toBe(false)
    expect(announcedBefore({ ...rental, placeId: 'parent', startsAt: s1.startsAt, endsAt: s1.endsAt }, previous)).toBe(
      true,
    )
    expect(announcedBefore({ ...booking, placeId: 'elsewhere' }, previous)).toBe(false)
  })

  it('lists at most the limit of entries and counts the rest', () => {
    expect(RESCHEDULE_ENTRY_LIMIT).toBe(500)
    expect(limitNoticeEntries(['a', 'b', 'c'], 2)).toEqual({ shown: ['a', 'b'], more: 1 })
    expect(limitNoticeEntries(['a', 'b'], 2)).toEqual({ shown: ['a', 'b'], more: 0 })
    const many = Array.from({ length: 501 }, (_, index) => index)
    const limited = limitNoticeEntries(many)
    expect(limited.shown).toHaveLength(500)
    expect(limited.shown[499]).toBe(499)
    expect(limited.more).toBe(1)
  })

  it('links staff to the place’s day filtered and administrators to B-24', () => {
    expect(placeDayToMoveHref(PLACE, '2026-11-20')).toBe(`/club/places/${PLACE}?date=2026-11-20&view=to_move`)
    expect(RENTALS_TO_MOVE_HREF).toBe('/backend/facilities/rentals?view=to_move')
    expect(isToMoveView('to_move')).toBe(true)
    expect(isToMoveView(null)).toBe(false)
    expect(isToMoveView('all')).toBe(false)
  })
})
