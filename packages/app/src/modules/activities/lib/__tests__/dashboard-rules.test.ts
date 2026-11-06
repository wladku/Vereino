import { describe, expect, it } from '@jest/globals'
import {
  SESSIONS_WIDGET_LIMIT,
  WIDGET_PERSPECTIVE,
  sessionsWidgetListHref,
  sessionsWidgetQuery,
  summarizeSessionsPage,
} from '../dashboard-rules'

// E06-S13 (#95): the dashboard widgets "Sessions needing a coach" and "Unsettled sessions" — their list queries, the
// B-15 perspective they open and the reduction of one list page to a count and up to five rows.
describe('sessions widget queries', () => {
  it('reads planned sessions without a coach from today for 14 days', () => {
    expect(Object.fromEntries(new URLSearchParams(sessionsWidgetQuery('sessionsNeedingCoach', '2026-12-25')))).toEqual({
      page: '1',
      pageSize: String(SESSIONS_WIDGET_LIMIT),
      sortField: 'startAt',
      sortDir: 'asc',
      unassigned: '1',
      from: '2026-12-25',
      to: '2027-01-08',
    })
  })

  it('reads unsettled sessions without a window', () => {
    expect(Object.fromEntries(new URLSearchParams(sessionsWidgetQuery('unsettledSessions', '2026-12-25')))).toEqual({
      page: '1',
      pageSize: '5',
      sortField: 'startAt',
      sortDir: 'asc',
      unsettled: '1',
    })
  })

  it('opens the matching B-15 perspective', () => {
    expect(WIDGET_PERSPECTIVE).toEqual({ sessionsNeedingCoach: 'unassigned', unsettledSessions: 'unsettled' })
    expect(sessionsWidgetListHref('sessionsNeedingCoach', '/backend/activities/occurrences')).toBe(
      '/backend/activities/occurrences?perspective=unassigned',
    )
    expect(sessionsWidgetListHref('unsettledSessions', '/backend/activities/occurrences')).toBe(
      '/backend/activities/occurrences?perspective=unsettled',
    )
  })
})

describe('sessions widget page summary', () => {
  it('keeps the rows with an id and the total of the list', () => {
    expect(
      summarizeSessionsPage({
        total: 7,
        items: [
          {
            id: 'a',
            startAt: '2026-11-06T16:00:00Z',
            activityName: 'Żaki',
            groupName: 'Żaki 2018',
            coachName: 'Marek W',
          },
          { id: 'b', startAt: '', activityName: null, groupName: 3 },
          null,
          'row',
          { startAt: '2026-11-06T16:00:00Z' },
        ],
      }),
    ).toEqual({
      total: 7,
      sessions: [
        {
          id: 'a',
          startAt: '2026-11-06T16:00:00Z',
          activityName: 'Żaki',
          groupName: 'Żaki 2018',
          coachName: 'Marek W',
        },
        { id: 'b', startAt: null, activityName: null, groupName: null, coachName: null },
      ],
    })
  })

  it('falls back to the rows for a missing or smaller total and lists five at most', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ id: `s${String(index)}` }))
    expect(summarizeSessionsPage({ items })).toMatchObject({ total: 6 })
    expect(summarizeSessionsPage({ items, total: 2 }).total).toBe(6)
    expect(summarizeSessionsPage({ items, total: Number.NaN }).sessions).toHaveLength(5)
    expect(summarizeSessionsPage({ items: 'none' })).toEqual({ total: 0, sessions: [] })
    expect(summarizeSessionsPage({})).toEqual({ total: 0, sessions: [] })
  })
})
