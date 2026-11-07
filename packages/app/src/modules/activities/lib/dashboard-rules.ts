// Pure rules of the `activities` dashboard widgets (README B-01; E06-S13 #95, on the E06-S06 pattern of #88):
// "Sessions needing a coach" reads `GET /api/activities/occurrences?unassigned=1` from today for 14 days, "Unsettled
// sessions" `?unsettled=1`; each shows the count (the list's `total`) and the first sessions in start order, every row
// linking to the session where it is fixed, and "Open list" leading to the matching B-15 perspective.
import { addCalendarDays, type CalendarDate } from '@vereino/core'
import { NEEDING_COACH_DAYS_AHEAD, perspectiveHref, type OccurrencePerspective } from './occurrence-list'

export type SessionsWidgetKind = 'sessionsNeedingCoach' | 'unsettledSessions'

/** How many sessions a widget lists; the count covers all of them. */
export const SESSIONS_WIDGET_LIMIT = 5

/** The B-15 perspective each widget opens. */
export const WIDGET_PERSPECTIVE: Readonly<Record<SessionsWidgetKind, OccurrencePerspective>> = {
  sessionsNeedingCoach: 'unassigned',
  unsettledSessions: 'unsettled',
}

/** The list query of a widget: its flag, the window of "Needing a coach", the first sessions by start. */
export function sessionsWidgetQuery(kind: SessionsWidgetKind, today: CalendarDate): string {
  const params: Record<string, string> = {
    page: '1',
    pageSize: String(SESSIONS_WIDGET_LIMIT),
    sortField: 'startAt',
    sortDir: 'asc',
  }
  if (kind === 'sessionsNeedingCoach') {
    params.unassigned = '1'
    params.from = today
    params.to = addCalendarDays(today, NEEDING_COACH_DAYS_AHEAD)
  } else {
    params.unsettled = '1'
  }
  return new URLSearchParams(params).toString()
}

/** The B-15 list in the widget's perspective. */
export function sessionsWidgetListHref(kind: SessionsWidgetKind, listPath: string): string {
  return perspectiveHref(listPath, WIDGET_PERSPECTIVE[kind])
}

export type WidgetSession = {
  id: string
  startAt: string | null
  activityName: string | null
  groupName: string | null
  coachName: string | null
}

export type SessionsWidgetData = { total: number; sessions: WidgetSession[] }

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

/** The count and the sessions of one list page, tolerating a malformed body (no rows, total 0). */
export function summarizeSessionsPage(body: { items?: unknown; total?: unknown }): SessionsWidgetData {
  const items = Array.isArray(body.items) ? body.items : []
  const sessions: WidgetSession[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string') continue
    sessions.push({
      id: row.id,
      startAt: text(row.startAt),
      activityName: text(row.activityName),
      groupName: text(row.groupName),
      coachName: text(row.coachName),
    })
  }
  const total = typeof body.total === 'number' && Number.isFinite(body.total) ? body.total : sessions.length
  return { total: Math.max(total, sessions.length), sessions: sessions.slice(0, SESSIONS_WIDGET_LIMIT) }
}
