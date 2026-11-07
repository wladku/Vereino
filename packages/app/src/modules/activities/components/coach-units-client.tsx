'use client'
// Client pieces the coach units report shares between the admin page (README B-16) and the phone's "My units" (#96):
// the response types of `GET /api/activities/reports/coach-units`, its URL, the amount in the club currency, and the
// "n sessions" disclosure — a native `<details>`, so it opens with the keyboard and needs no state.
import * as React from 'react'

export type CoachUnitsSessionRole = 'unit' | 'handed_over' | 'taken_over' | 'match' | 'trip'

export type CoachUnitsSession = {
  id: string
  date: string
  type: string
  isAway: boolean
  role: CoachUnitsSessionRole
  activityName: string | null
  groupName: string | null
}

export type CoachUnitsRow = {
  personId: string
  coachName: string | null
  planned: number
  handedOver: number
  takenOver: number
  balance: number
  matches: number
  trips: number
  sessions: CoachUnitsSession[]
  amount?: number | null
  contractState?: 'ok' | 'no_contract' | 'incomplete'
}

export type CoachUnitsReportData = {
  month: string
  from: string
  to: string
  perspective: 'staff' | 'own'
  model: 'units_per_contract' | 'fixed_base_adjusted'
  currency: string
  withAmounts: boolean
  items: CoachUnitsRow[]
  unsettledCount: number
}

type Translate = (key: string, params?: Record<string, string | number>) => string

export function coachUnitsUrl(query: { month: string; sectionId?: string; mine?: boolean; format?: 'csv' }): string {
  const params = new URLSearchParams({ month: query.month })
  if (query.sectionId) params.set('sectionId', query.sectionId)
  if (query.mine) params.set('mine', '1')
  if (query.format) params.set('format', query.format)
  return `/api/activities/reports/coach-units?${params.toString()}`
}

/** Grosz in the club currency, in the user's locale. */
export function formatAmount(grosz: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(grosz / 100)
}

/** `YYYY-MM-DD` as a short local date ("Mon, 3 Nov"), read as a calendar day (no time-zone shift). */
function formatDay(date: string, locale: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

/** "n sessions" that opens into the sessions behind the row, each with why it counts. */
export function CoachUnitsSessions({ row, t, locale }: { row: CoachUnitsRow; t: Translate; locale: string }) {
  if (row.sessions.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <details className="group" data-testid="coach-units-sessions">
      <summary className="text-primary min-h-11 cursor-pointer py-2 underline-offset-2 hover:underline">
        {t('activities.reports.coachUnits.sessionsCount', { count: row.sessions.length })}
      </summary>
      <ul className="flex flex-col gap-1 py-1 text-sm">
        {row.sessions.map((session) => (
          <li key={`${session.id}:${session.role}`} className="flex flex-wrap gap-x-2">
            <span className="tabular-nums">{formatDay(session.date, locale)}</span>
            <span>{session.activityName ?? session.groupName ?? '—'}</span>
            <span className="text-muted-foreground">
              {t(`activities.reports.coachUnits.roles.${session.role}`)}
              {session.isAway && session.role !== 'trip' && session.role !== 'handed_over'
                ? ` · ${t('activities.reports.coachUnits.roles.trip')}`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
