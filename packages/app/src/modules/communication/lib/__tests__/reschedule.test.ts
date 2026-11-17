import { describe, expect, it } from '@jest/globals'
import type { TranslateWithFallbackFn } from '@open-mercato/shared/lib/i18n/translate'
import { dayLabel, pointLabel, rescheduleLines, ruleLabel, shortDateLabel, type ReschedulePoint } from '../reschedule'

// The fallback text with its values filled in; a role key falls back to the role id.
const t = ((_key: string, fallback?: string, values?: Record<string, string | number>) =>
  (fallback ?? '').replace(/\{(\w+)\}/g, (_match, name: string) =>
    String(values?.[name] ?? ''),
  )) as TranslateWithFallbackFn

const ctx = { activityName: 'Trening Żaków', locale: 'en', timeZone: 'Europe/Warsaw' }

const before: ReschedulePoint = {
  startAt: '2026-11-18T16:00:00.000Z',
  endAt: '2026-11-18T17:30:00.000Z',
  gatheringAt: null,
  place: 'Boisko piłkarskie',
}
const after: ReschedulePoint = {
  startAt: '2026-11-19T16:00:00.000Z',
  endAt: '2026-11-19T17:30:00.000Z',
  gatheringAt: '2026-11-19T15:30:00.000Z',
  place: 'Sala gimnastyczna',
}

describe('labels of a moved session (REQ-A09)', () => {
  it('names the short weekday and the day and month in the club zone', () => {
    expect(shortDateLabel(new Date('2026-11-18T23:30:00Z'), 'en', 'Europe/Warsaw')).toBe('Thu 19.11')
    expect(shortDateLabel(new Date('2026-11-18T16:00:00Z'), 'pl', 'Europe/Warsaw')).toBe('śr. 18.11')
  })

  it('names a point with and without a gathering time', () => {
    expect(pointLabel(t, before, ctx)).toBe('Wed 18.11 17:00, Boisko piłkarskie')
    expect(pointLabel(t, after, ctx)).toBe('Thu 19.11 17:00 (gathering 16:30), Sala gimnastyczna')
  })

  it('names a series rule with and without a gathering offset', () => {
    const rule = { startTime: '17:00:00', endTime: '18:30:00', gatheringMinutesBefore: null, place: 'Hala' }
    expect(ruleLabel(t, rule)).toBe('17:00–18:30, Hala')
    expect(ruleLabel(t, { ...rule, gatheringMinutesBefore: 30 })).toBe('17:00–18:30 (gathering 30 min before), Hala')
  })

  it('writes a calendar date day first', () => {
    expect(dayLabel('2026-11-25')).toBe('25.11.2026')
  })
})

describe('the lines of a notice', () => {
  const actor = { name: 'Ewa Nowak', role: 'coordinator' as const }

  it('names the old and the new values of a move, by whom when known', () => {
    expect(rescheduleLines(t, { kind: 'moved', before, after }, ctx, actor)).toEqual({
      subject: 'Moved: Trening Żaków, Thu 19.11',
      lead: 'Moved by Ewa Nowak (coordinator): Wed 18.11 17:00, Boisko piłkarskie → Thu 19.11 17:00 (gathering 16:30), Sala gimnastyczna',
    })
    expect(rescheduleLines(t, { kind: 'moved', before, after }, ctx, null).lead).toBe(
      'Moved: Wed 18.11 17:00, Boisko piłkarskie → Thu 19.11 17:00 (gathering 16:30), Sala gimnastyczna',
    )
  })

  it('says a restored session takes place after all', () => {
    expect(
      rescheduleLines(t, { kind: 'restored', after: before }, ctx, { name: 'Jan Admin', role: 'club_admin' }),
    ).toEqual({
      subject: 'Takes place after all: Trening Żaków, Wed 18.11',
      lead: 'Takes place after all, restored by Jan Admin (club_admin): Wed 18.11 17:00, Boisko piłkarskie',
    })
    expect(rescheduleLines(t, { kind: 'restored', after: before }, ctx, null).lead).toBe(
      'Takes place after all: Wed 18.11 17:00, Boisko piłkarskie',
    )
  })

  it('names the first changed date, the number of sessions and both rules of a series change', () => {
    const notice = {
      kind: 'series' as const,
      from: '2026-11-25',
      movedCount: 9,
      before: { startTime: '17:00', endTime: '18:30', gatheringMinutesBefore: null, place: 'Hala' },
      after: { startTime: '17:30', endTime: '19:00', gatheringMinutesBefore: null, place: 'Hala' },
    }
    expect(rescheduleLines(t, notice, ctx, actor)).toEqual({
      subject: 'Schedule changed: Trening Żaków',
      lead: 'Schedule changed by Ewa Nowak (coordinator): from 25.11.2026, 9 sessions: 17:00–18:30, Hala → 17:30–19:00, Hala',
    })
    expect(rescheduleLines(t, notice, ctx, null).lead).toBe(
      'Schedule changed: from 25.11.2026, 9 sessions: 17:00–18:30, Hala → 17:30–19:00, Hala',
    )
  })
})
