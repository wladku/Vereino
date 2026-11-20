// Client-side pieces of the panel's club event pages (club events spec B-T1, B-T2, B-T3, REQ-T11; #378): the rows
// and the record as `/api/activities/club-events*` answer them, the links, the form options and the date range label.
// Authorization stays on the routes and commands; `mayManage` only hides actions the server would refuse.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { DeclarationKinds, Translate } from './client-helpers'
import { OWN_FORBIDDEN_STATE } from './client-helpers'

export const CLUB_EVENTS_HREF = '/backend/activities/club-events'
export const CLUB_EVENT_CREATE_HREF = `${CLUB_EVENTS_HREF}/create`
export const clubEventHref = (id: string, tab?: string) =>
  `${CLUB_EVENTS_HREF}/${encodeURIComponent(id)}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`

/** The select value of a whole-club event (a select item cannot hold an empty or null value). */
export const WHOLE_CLUB = '__club__'
/** The select value of an open part ("No club group"). */
export const NO_GROUP = '__none__'

export type ClubEventRow = {
  id: string
  name: string | null
  publicSlug: string | null
  sectionId: string | null
  sectionName?: string | null
  placeId: string | null
  placeName?: string | null
  placeExternal?: boolean
  description: string | null
  gatheringMinutesBefore: number | null
  confirmByMinutesBefore: number | null
  isPublic: boolean
  status: string | null
  cancelReason: string | null
  dateFrom?: string | null
  dateTo?: string | null
  partsCount?: number
  mayManage?: boolean
  updatedAt: string | null
}

export type ClubEventPart = {
  id: string
  kind: 'group' | 'open'
  title: string
  categoryLabel: string | null
  type: string
  visitingTeamIds: string[]
  visitingTeams: Array<{ id: string; name: string; clubName: string | null }>
  activityId: string | null
  occurrenceId: string | null
  groupId: string | null
  groupName: string | null
  sectionName: string | null
  startAt: string | null
  endAt: string | null
  coachPersonId: string | null
  coachName: string | null
  status: string | null
  cancelReason: string | null
  gatheringAt: string | null
  confirmBy: string | null
  declaredCount: number
  updatedAt: string
}

export type ClubEventDetail = ClubEventRow & { publicPath?: string | null; parts: ClubEventPart[] }

export type ClubEventGroupOption = {
  id: string
  name: string
  kind: 'team' | 'class_group'
  sectionId: string
  sectionName: string | null
  ageCategoryLabel: string | null
}

export type ClubEventOptions = {
  wholeClub: boolean
  sections: Array<{ id: string; name: string }>
  groups: ClubEventGroupOption[]
  places: Array<{ id: string; label: string; isExternal: boolean }>
  declarationKinds: DeclarationKinds
}

export const CLUB_EVENT_OPTIONS_QUERY_KEY = ['activities-club-event-options']

/** The option sources of the club event and part forms (`GET /api/activities/club-events/options`). */
export function useClubEventOptions(enabled = true) {
  return useQuery({
    queryKey: CLUB_EVENT_OPTIONS_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<ClubEventOptions | null> => {
      const call = await apiCall<ClubEventOptions>('/api/activities/club-events/options', OWN_FORBIDDEN_STATE)
      return call.ok ? (call.result ?? null) : null
    },
  })
}

/** "21.11.2026–29.11.2026" (or one day) in the reader's locale; null while the event has no part. */
export function clubEventDatesLabel(locale: string, row: Pick<ClubEventRow, 'dateFrom' | 'dateTo'>): string | null {
  if (!row.dateFrom) return null
  const format = (date: string) =>
    new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00Z`),
    )
  return row.dateTo && row.dateTo !== row.dateFrom
    ? `${format(row.dateFrom)}–${format(row.dateTo)}`
    : format(row.dateFrom)
}

/** The heading of a day of the Parts tab: "Saturday, 21.11.2026" in the reader's locale. */
export function partDayLabel(t: Translate, locale: string, date: string): string {
  if (!date) return t('activities.clubEvents.parts.noDay')
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function clubEventStatusVariant(status: string | null | undefined): 'info' | 'error' | 'neutral' {
  if (status === 'planned') return 'info'
  if (status === 'cancelled') return 'error'
  return 'neutral'
}
