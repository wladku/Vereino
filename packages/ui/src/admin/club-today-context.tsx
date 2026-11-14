'use client'
// The club time zone of the current page (#231): the backend layout and the `/club` frames that read the club's
// settings provide it once, and a component asks `useClubToday()` for the club's calendar date instead of building one
// from the browser clock. Without a provider the hook answers in the browser's zone (the behavior before #231).
import * as React from 'react'
import type { CalendarDate } from '@vereino/core'
import { clubToday } from '#src/admin/club-today'

const ClubTimeZoneContext = React.createContext<string | null>(null)

/** Gives the components below it the club's IANA time zone; `null` keeps the browser's. */
export function ClubTimeZoneProvider({ timeZone, children }: { timeZone: string | null; children?: React.ReactNode }) {
  return <ClubTimeZoneContext.Provider value={timeZone}>{children}</ClubTimeZoneContext.Provider>
}

/** The club time zone the page provides, or null. */
export function useClubTimeZone(): string | null {
  return React.useContext(ClubTimeZoneContext)
}

/**
 * Today's calendar date (`YYYY-MM-DD`) in the club zone, as of the component's first render: a form's proposed date
 * and its `initialValues` stay put when the page stays open past midnight (a `CrudForm` re-applies changed initial
 * values, which would throw away what was typed).
 */
export function useClubToday(): CalendarDate {
  const timeZone = useClubTimeZone()
  return React.useMemo(() => clubToday(new Date(), timeZone), [timeZone])
}
