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

/** The phone pages of club events (REQ-T12, #380). */
export const MEMBER_CLUB_EVENTS_HREF = '/club/club-events'
export const MEMBER_CLUB_EVENT_NEW_HREF = `${MEMBER_CLUB_EVENTS_HREF}/new`
export const memberClubEventHref = (id: string) => `${MEMBER_CLUB_EVENTS_HREF}/${encodeURIComponent(id)}`
export const memberClubEventEditHref = (id: string) => `${memberClubEventHref(id)}/edit`
export const memberPartNewHref = (id: string, copyOf?: string | null) =>
  `${memberClubEventHref(id)}/parts/new${copyOf ? `?copyOf=${encodeURIComponent(copyOf)}` : ''}`
export const memberPartEditHref = (id: string, partId: string) =>
  `${memberClubEventHref(id)}/parts/${encodeURIComponent(partId)}/edit`

/** The select values of a whole-club event and of an open part, shared with the phone forms (#380). */
export { NO_GROUP, WHOLE_CLUB } from '../lib/member-club-event'

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

/** A poster or funder logo of a club event (REQ-T08, #379); `url` is the authenticated staff image route. */
export type ClubEventFileItem = {
  id: string
  kind: 'poster' | 'funder_logo'
  funderName: string | null
  fileName: string
  mimeType: string
  fileSize: number
  position: number
  url: string
  createdAt: string
  updatedAt: string
}

export type ClubEventDetail = ClubEventRow & {
  publicPath?: string | null
  parts: ClubEventPart[]
  files?: ClubEventFileItem[]
}

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

export type ClubEventOptionsLoad = { status: 'ok'; options: ClubEventOptions } | { status: 'denied' }

/** The options when the read answered them; null while loading, on 403 and on a failed read. */
export const clubEventOptionsOf = (load: ClubEventOptionsLoad | undefined): ClubEventOptions | null =>
  load?.status === 'ok' ? load.options : null

/**
 * The option sources of the club event and part forms (`GET /api/activities/club-events/options`): 403 is the
 * `denied` state (the caller organises no club events); any other failure throws, so the page shows a retry (#440).
 */
export function useClubEventOptions(enabled = true) {
  return useQuery({
    queryKey: CLUB_EVENT_OPTIONS_QUERY_KEY,
    enabled,
    queryFn: async (): Promise<ClubEventOptionsLoad> => {
      const call = await apiCall<ClubEventOptions>('/api/activities/club-events/options', OWN_FORBIDDEN_STATE)
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { status: 'ok', options: call.result }
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

export type ClubEventLoad = { status: 'ok'; event: ClubEventDetail } | { status: 'not_found' } | { status: 'denied' }

/** The query key of one club event (the panel record and the phone pages share it). */
export const clubEventQueryKey = (id: string) => ['activities-club-event', id]

/** One club event with its parts and files (`GET /api/activities/club-events/{id}`): 404 and 403 as states. */
export function useClubEvent(id: string, enabled = true) {
  return useQuery({
    queryKey: clubEventQueryKey(id),
    enabled,
    queryFn: async (): Promise<ClubEventLoad> => {
      const call = await apiCall<ClubEventDetail>(
        `/api/activities/club-events/${encodeURIComponent(id)}`,
        OWN_FORBIDDEN_STATE,
      )
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { status: 'ok', event: call.result }
    },
  })
}
