import { describe, expect, it } from '@jest/globals'
import {
  SIGNED_IN_SESSION_PATH,
  publicSessionPath,
  publicSessionView,
  sessionWhen,
  shareTextKey,
  shareTextPath,
} from '../share-text'

const ID = '11111111-1111-4111-8111-111111111111'

describe('share text paths (DD-M14, DD-17)', () => {
  it('builds the public session path with encoded segments', () => {
    expect(publicSessionPath('dev-academy', ID)).toBe(`/p/dev-academy/s/${ID}`)
    expect(publicSessionPath('a b', 'x/y')).toBe('/p/a%20b/s/x%2Fy')
  })

  it('points at the public page only when the club publishes one with a slug', () => {
    expect(shareTextPath({ publicSlug: 'dev-academy', publicationEnabled: true }, ID)).toBe(`/p/dev-academy/s/${ID}`)
    expect(shareTextPath({ publicSlug: 'dev-academy', publicationEnabled: false }, ID)).toBe(SIGNED_IN_SESSION_PATH)
    expect(shareTextPath({ publicSlug: null, publicationEnabled: true }, ID)).toBe('/club/calendar')
  })

  it('chooses the cancelled line for a cancelled session and the plain line otherwise', () => {
    expect(shareTextKey('cancelled')).toBe('activities.shareText.cancelled')
    expect(shareTextKey('planned')).toBe('activities.shareText.planned')
    expect(shareTextKey('done')).toBe('activities.shareText.planned')
  })

  it('names the gathering time when the session has one (DD-43)', () => {
    expect(shareTextKey('planned', true)).toBe('activities.shareText.plannedWithGathering')
    expect(shareTextKey('cancelled', true)).toBe('activities.shareText.cancelledWithGathering')
    expect(shareTextKey('cancelled', false)).toBe('activities.shareText.cancelled')
  })
})

describe('session date and time in the club zone', () => {
  it('formats the date and the 24-hour times in the zone and the locale', () => {
    const when = sessionWhen(
      { startAt: new Date('2026-11-03T16:00:00Z'), endAt: new Date('2026-11-03T17:30:00Z') },
      'en-GB',
      'Europe/Warsaw',
    )
    expect(when).toEqual({ date: 'Tue 3 Nov', startTime: '17:00', endTime: '18:30', gatheringTime: null })
  })

  it('formats the gathering time in the zone when the session has one (DD-43)', () => {
    const session = { startAt: new Date('2026-11-03T16:00:00Z'), endAt: new Date('2026-11-03T17:30:00Z') }
    const gathering = new Date('2026-11-03T15:15:00Z')
    expect(sessionWhen({ ...session, gatheringAt: gathering }, 'en-GB', 'Europe/Warsaw').gatheringTime).toBe('16:15')
    expect(sessionWhen({ ...session, gatheringAt: null }, 'en-GB', 'Europe/Warsaw').gatheringTime).toBeNull()
  })
})

describe('public session view (DD-17)', () => {
  it('keeps only the activity name, the date, the times, the zone and the status', () => {
    const view = publicSessionView(
      {
        occurrenceDate: '2026-11-03',
        startAt: new Date('2026-11-03T16:00:00Z'),
        endAt: new Date('2026-11-03T17:30:00Z'),
        status: 'cancelled',
      },
      'Rocznik 2015 — training',
      'Europe/Warsaw',
    )
    expect(view).toEqual({
      activityName: 'Rocznik 2015 — training',
      occurrenceDate: '2026-11-03',
      startAt: '2026-11-03T16:00:00.000Z',
      endAt: '2026-11-03T17:30:00.000Z',
      gatheringAt: null,
      timeZone: 'Europe/Warsaw',
      status: 'cancelled',
    })
  })

  it('carries the gathering time when the session has one (DD-43)', () => {
    const view = publicSessionView(
      {
        occurrenceDate: '2026-11-03',
        startAt: new Date('2026-11-03T16:00:00Z'),
        endAt: new Date('2026-11-03T17:30:00Z'),
        gatheringAt: new Date('2026-11-03T15:15:00Z'),
        status: 'planned',
      },
      'Rocznik 2015 — match',
      'Europe/Warsaw',
    )
    expect(view.gatheringAt).toBe('2026-11-03T15:15:00.000Z')
  })
})
