// The phone form that edits one session (`/club/occurrences/[id]/edit`, REQ-A08 of the groups and activities parity
// spec, DD-A05; #270): the date, the start and the end in the club's time zone, a club place or a typed venue, the
// gathering time and the declaration deadline. It starts from the session as the coach reads it, checks the draft
// before sending, and builds the body of `PATCH /api/activities/occurrences/{id}` with only what changed — an
// untouched gathering time or deadline is not sent, so a moved session keeps its offsets (DD-43, REQ-A07). Pure.
import { addCalendarDays, isCalendarDate, isLocalTime, zonedInstant, type CalendarDate } from '@vereino/core'
import { localDateTime } from './activities-rules'
import {
  gatheringMinutes,
  locationProblems,
  locationVenue,
  type EventDraftProblem,
  type VenueMode,
} from './member-event'
import type { TypedVenue } from './venue'

/** The session as the edit form starts from it (`GET /api/activities/calendar/{id}?as=coach`). */
export type EditableSession = {
  startAt: string
  endAt: string
  placeId: string | null
  venue: TypedVenue | null
  gatheringAt: string | null
  confirmBy: string | null
}

export type SessionEditDraft = {
  date: string
  startTime: string
  endTime: string
  venueMode: VenueMode
  placeId: string
  venueName: string
  venueAddress: string
  /** `HH:mm` on the session's day; empty = none. */
  gatheringTime: string
  /** The deadline's date and wall time; both empty = none. */
  confirmByDate: string
  confirmByTime: string
}

export type SessionEditField =
  | 'date'
  | 'startTime'
  | 'endTime'
  | 'placeId'
  | 'venueName'
  | 'venueAddress'
  | 'gatheringTime'
  | 'confirmByDate'
  | 'confirmByTime'

export type SessionEditProblem = EventDraftProblem | 'incomplete'
export type SessionEditProblems = Partial<Record<SessionEditField, SessionEditProblem>>

function wall(instant: string, timeZone: string): { date: CalendarDate; time: string } {
  const local = localDateTime(new Date(instant), timeZone)
  return { date: local.date, time: local.time.slice(0, 5) }
}

/** Whole days from one club-zone date to another (a weekend tournament's session spans several). */
function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** The draft of a session as it is now, in the club's time zone. */
export function sessionEditDraft(session: EditableSession, timeZone: string): SessionEditDraft {
  const start = wall(session.startAt, timeZone)
  const end = wall(session.endAt, timeZone)
  const confirmBy = session.confirmBy ? wall(session.confirmBy, timeZone) : null
  return {
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    venueMode: session.venue ? 'venue' : 'place',
    placeId: session.placeId ?? '',
    venueName: session.venue?.name ?? '',
    venueAddress: session.venue?.address ?? '',
    gatheringTime: session.gatheringAt ? wall(session.gatheringAt, timeZone).time : '',
    confirmByDate: confirmBy?.date ?? '',
    confirmByTime: confirmBy?.time ?? '',
  }
}

/** The problems that keep the form from sending; an empty object means it may be sent. */
export function sessionEditProblems(draft: SessionEditDraft, showDeadline: boolean): SessionEditProblems {
  const problems: SessionEditProblems = {}
  if (!draft.date) problems.date = 'required'
  else if (!isCalendarDate(draft.date)) problems.date = 'invalid'
  for (const field of ['startTime', 'endTime'] as const) {
    if (!draft[field]) problems[field] = 'required'
    else if (!isLocalTime(draft[field])) problems[field] = 'invalid'
  }
  if (!problems.date && !problems.startTime && !problems.endTime && draft.endTime <= draft.startTime) {
    problems.endTime = 'endBeforeStart'
  }
  Object.assign(problems, locationProblems(draft))
  if (gatheringMinutes(draft.gatheringTime, draft.startTime) === 'invalid') problems.gatheringTime = 'invalid'
  if (showDeadline) {
    const date = draft.confirmByDate.trim()
    const time = draft.confirmByTime.trim()
    if (Boolean(date) !== Boolean(time)) problems[date ? 'confirmByTime' : 'confirmByDate'] = 'incomplete'
    else if (date && !isCalendarDate(date)) problems.confirmByDate = 'invalid'
    else if (time && !isLocalTime(time)) problems.confirmByTime = 'invalid'
  }
  return problems
}

export type SessionEditBody = {
  startAt: string
  endAt: string
  placeId?: string
  venue?: TypedVenue
  gatheringAt?: string | null
  confirmBy?: string | null
}

/**
 * The PATCH body of a draft without problems: the instants always (the end keeps the session's span in days), the
 * place or venue only when the location changed, and the gathering time or deadline only when the user changed it
 * (null clears it).
 */
export function sessionEditBody(
  draft: SessionEditDraft,
  initial: SessionEditDraft,
  session: Pick<EditableSession, 'startAt' | 'endAt'>,
  timeZone: string,
): SessionEditBody {
  const span = daysBetween(wall(session.startAt, timeZone).date, wall(session.endAt, timeZone).date)
  const body: SessionEditBody = {
    startAt: zonedInstant(draft.date, draft.startTime, timeZone).toISOString(),
    endAt: zonedInstant(addCalendarDays(draft.date, span), draft.endTime, timeZone).toISOString(),
  }
  const venue = locationVenue(draft)
  const initialVenue = locationVenue(initial)
  if (venue) {
    if (venue.name !== initialVenue?.name || venue.address !== initialVenue.address) body.venue = venue
  } else if (initial.venueMode === 'venue' || draft.placeId !== initial.placeId) {
    body.placeId = draft.placeId
  }
  const gatheringTime = draft.gatheringTime.trim()
  if (gatheringTime !== initial.gatheringTime) {
    body.gatheringAt = gatheringTime ? zonedInstant(draft.date, gatheringTime, timeZone).toISOString() : null
  }
  const confirmByDate = draft.confirmByDate.trim()
  const confirmByTime = draft.confirmByTime.trim()
  if (confirmByDate !== initial.confirmByDate || confirmByTime !== initial.confirmByTime) {
    body.confirmBy =
      confirmByDate && confirmByTime ? zonedInstant(confirmByDate, confirmByTime, timeZone).toISOString() : null
  }
  return body
}

const FIELD_OF_CODE: ReadonlyMap<string, SessionEditField> = new Map([
  ['activity_times_inverted', 'endTime'],
  ['place_not_bookable', 'placeId'],
  ['venue_or_place_required', 'placeId'],
  ['venue_requires_one_off', 'placeId'],
  ['occurrence_gathering_after_start', 'gatheringTime'],
  ['occurrence_gathering_too_early', 'gatheringTime'],
  ['occurrence_confirm_by_after_start', 'confirmByTime'],
  ['occurrence_confirm_by_too_early', 'confirmByTime'],
  ['occurrence_confirm_by_in_past', 'confirmByTime'],
])

/** The form field a 422 refusal points at, or null for a refusal the form shows above the fields. */
export function sessionEditFieldOfError(code: string | null): SessionEditField | null {
  return code ? (FIELD_OF_CODE.get(code) ?? null) : null
}

/**
 * Why the edit form refuses a session, so the refusal names the way forward for the reader's case (E20-S10, #489):
 * `not_yours` — the session is outside the caller's groups and sections (a 403 read, or the coordinator's read that
 * offers no edit); `not_planned` — cancelled or settled; `club_event_part` — a part session, moved by the club event's
 * organisers; `coach_series` — a coach's session of a series, moved by the section coordinator. Null: the form shows.
 */
export type SessionEditRefusal = 'not_yours' | 'not_planned' | 'club_event_part' | 'coach_series'

export function sessionEditRefusal(
  read:
    | { status: 'forbidden' }
    | { status: 'ok'; mayEdit: boolean; planned: boolean; partOfClubEvent: boolean; as: 'coach' | 'coordinator' },
): SessionEditRefusal | null {
  if (read.status === 'forbidden') return 'not_yours'
  if (!read.planned) return 'not_planned'
  if (read.mayEdit) return null
  if (read.partOfClubEvent) return 'club_event_part'
  return read.as === 'coach' ? 'coach_series' : 'not_yours'
}

/** The refusal of a 403 save, by its code: the same reasons as the read's (`scope_denied` and any other code: not yours). */
export function sessionEditRefusalOfCode(code: string | null): SessionEditRefusal {
  if (code === 'coach_edit_series_session') return 'coach_series'
  if (code === 'club_event_part_managed_by_event') return 'club_event_part'
  return 'not_yours'
}
