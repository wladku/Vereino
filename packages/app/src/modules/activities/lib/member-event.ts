// The coach's phone form for a one-off event (club spec REQ-027, *UI architecture* "New event"; #140): the options it
// offers — the groups the coach coaches, with their section, and the bookable leaves of the club's places — the
// checks it runs before sending, the request body of `POST /api/activities/events` with the instants in the club's
// time zone, the declaration deadline in hours before the start (REQ-A07), and the form field a refusal points at.
// From REQ-A08 (#270) it also takes a typed venue instead of a club place ("Other address"), an opponent for a
// sparring or a match, "away" and a gathering time. Pure.
import { isCalendarDate, isLocalTime, zonedInstant } from '@vereino/core'
import { EVENT_TYPES, takesOpponent, type ActivityType, type GroupKindLike } from './activities-rules'
import { MAX_GATHERING_MINUTES } from './gathering'
import { VENUE_ADDRESS_MAX, VENUE_ADDRESS_MIN, VENUE_NAME_MAX, VENUE_NAME_MIN, type TypedVenue } from './venue'

/** The limits of the event's name and note, as `eventCreateSchema` sets them. */
export const EVENT_NAME_MAX = 200
export const EVENT_NOTE_MAX = 4000
/** The largest deadline the phone form takes, in hours: 14 days (REQ-A07). */
export const EVENT_CONFIRM_BY_MAX_HOURS = 336

export type EventGroupSource = { id: string; name: string; kind: GroupKindLike; sectionId: string; isActive: boolean }
export type EventGroupOption = { id: string; name: string; kind: GroupKindLike; sectionName: string | null }

/** The coach's active groups, by section name and then group name; a group of an unknown section sorts first. */
export function eventGroupOptions(
  groups: readonly EventGroupSource[],
  sectionNames: ReadonlyMap<string, string>,
): EventGroupOption[] {
  const sectionKey = (option: EventGroupOption) => option.sectionName ?? ''
  return groups
    .filter((group) => group.isActive)
    .map((group) => ({
      id: group.id,
      name: group.name,
      kind: group.kind,
      sectionName: sectionNames.get(group.sectionId) ?? null,
    }))
    .sort(
      (a, b) =>
        sectionKey(a).localeCompare(sectionKey(b), 'pl') ||
        a.name.localeCompare(b.name, 'pl') ||
        a.id.localeCompare(b.id),
    )
}

export type EventPlaceSource = {
  id: string
  name: string
  parentName: string | null
  isLeaf: boolean
  /** A venue outside the club's own places (club events spec REQ-T05: the pickers mark it). */
  isExternal?: boolean
}
export type EventPlaceOption = { id: string; label: string; isExternal: boolean }

/**
 * The places a session may point to (a leaf: a complex is booked through its pitches), "Complex › Pitch", by label,
 * each saying whether it is external (club events spec REQ-T05).
 */
export function eventPlaceOptions(places: readonly EventPlaceSource[]): EventPlaceOption[] {
  return places
    .filter((place) => place.isLeaf)
    .map((place) => ({
      id: place.id,
      label: place.parentName ? `${place.parentName} › ${place.name}` : place.name,
      isExternal: place.isExternal === true,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pl') || a.id.localeCompare(b.id))
}

/** Where the event takes place: a club place, or an address typed in (REQ-A08). */
export type VenueMode = 'place' | 'venue'

/** What the coach filled in: one day with a start and an end in the club's time zone. */
export type EventDraft = {
  groupId: string
  type: string
  name: string
  placeId: string
  /** Absent = a club place (the form before REQ-A08). */
  venueMode?: VenueMode
  venueName?: string
  venueAddress?: string
  /** The opponent of a sparring or a match (an external team id); empty = none. */
  opponentExternalTeamId?: string
  /** "Away"; absent = the server's default (on with a typed venue, Q-A25). */
  isAway?: boolean
  /** The gathering wall time on the event's day (`HH:mm`, DD-43); empty or absent = none. */
  gatheringTime?: string
  date: string
  startTime: string
  endTime: string
  invitedExternalTeamIds: readonly string[]
  description: string
  /** The declaration deadline in whole hours before the start (REQ-A07); empty or absent = none. */
  confirmByHours?: string
}

export type EventDraftField =
  | 'groupId'
  | 'type'
  | 'name'
  | 'placeId'
  | 'venueName'
  | 'venueAddress'
  | 'date'
  | 'startTime'
  | 'gatheringTime'
  | 'endTime'
  | 'confirmByHours'
export type EventDraftProblem = 'required' | 'invalid' | 'endBeforeStart'
export type EventDraftProblems = Partial<Record<EventDraftField, EventDraftProblem>>

/** Whole hours 1–336 as a number, or null. */
function confirmByHours(text: string): number | null {
  const hours = Number(text)
  return Number.isInteger(hours) && hours >= 1 && hours <= EVENT_CONFIRM_BY_MAX_HOURS ? hours : null
}

function isEventType(value: string): value is ActivityType {
  return (EVENT_TYPES as readonly string[]).includes(value)
}

/** The problem of a typed text against its limits once trimmed: empty is required, outside the limits invalid. */
function textProblem(value: string | undefined, min: number, max: number): EventDraftProblem | null {
  const text = value?.trim() ?? ''
  if (!text) return 'required'
  return text.length < min || text.length > max ? 'invalid' : null
}

/**
 * The problems of a location (REQ-A08): a club place, or a typed venue with a name (2–120 characters) and an address
 * (5–300). Shared by the new-event form and the session edit form.
 */
export function locationProblems(location: {
  venueMode?: VenueMode
  placeId: string
  venueName?: string
  venueAddress?: string
}): Partial<Record<'placeId' | 'venueName' | 'venueAddress', EventDraftProblem>> {
  if (location.venueMode !== 'venue') return location.placeId ? {} : { placeId: 'required' }
  const problems: Partial<Record<'venueName' | 'venueAddress', EventDraftProblem>> = {}
  const name = textProblem(location.venueName, VENUE_NAME_MIN, VENUE_NAME_MAX)
  const address = textProblem(location.venueAddress, VENUE_ADDRESS_MIN, VENUE_ADDRESS_MAX)
  if (name) problems.venueName = name
  if (address) problems.venueAddress = address
  return problems
}

/** The typed venue of a location in the venue mode, trimmed; null for a club place. */
export function locationVenue(location: {
  venueMode?: VenueMode
  venueName?: string
  venueAddress?: string
}): TypedVenue | null {
  if (location.venueMode !== 'venue') return null
  return { name: location.venueName?.trim() ?? '', address: location.venueAddress?.trim() ?? '' }
}

/** Minutes of an `HH:mm` wall time since midnight. */
function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * The gathering offset of a gathering wall time on the start's day, in minutes before the start (DD-43): null for an
 * empty time, `invalid` for a malformed one or one not 1–720 minutes before the start.
 */
export function gatheringMinutes(gatheringTime: string | undefined, startTime: string): number | null | 'invalid' {
  const time = gatheringTime?.trim() ?? ''
  if (!time) return null
  if (!isLocalTime(time) || !isLocalTime(startTime)) return 'invalid'
  const minutes = minutesOfDay(startTime) - minutesOfDay(time)
  return minutes >= 1 && minutes <= MAX_GATHERING_MINUTES ? minutes : 'invalid'
}

/** The problems that keep the form from sending; an empty object means it may be sent. */
export function eventDraftProblems(draft: EventDraft): EventDraftProblems {
  const problems: EventDraftProblems = {}
  if (!draft.groupId) problems.groupId = 'required'
  if (!draft.type) problems.type = 'required'
  else if (!isEventType(draft.type)) problems.type = 'invalid'
  if (!draft.name.trim()) problems.name = 'required'
  else if (draft.name.trim().length > EVENT_NAME_MAX) problems.name = 'invalid'
  Object.assign(problems, locationProblems(draft))
  if (!draft.date) problems.date = 'required'
  else if (!isCalendarDate(draft.date)) problems.date = 'invalid'
  for (const field of ['startTime', 'endTime'] as const) {
    if (!draft[field]) problems[field] = 'required'
    else if (!isLocalTime(draft[field])) problems[field] = 'invalid'
  }
  if (!problems.startTime && !problems.endTime && draft.endTime <= draft.startTime) problems.endTime = 'endBeforeStart'
  if (gatheringMinutes(draft.gatheringTime, draft.startTime) === 'invalid') problems.gatheringTime = 'invalid'
  const hours = draft.confirmByHours?.trim() ?? ''
  if (hours && confirmByHours(hours) === null) problems.confirmByHours = 'invalid'
  return problems
}

export type EventRequestBody = {
  groupId: string
  type: string
  name: string
  placeId?: string
  venue?: TypedVenue
  opponentExternalTeamId?: string
  isAway?: boolean
  gatheringMinutesBefore?: number
  startsAt: string
  endsAt: string
  invitedExternalTeamIds: string[]
  description: string | null
  confirmByMinutesBefore?: number
}

/**
 * The body of `POST /api/activities/events` for a draft without problems: the wall times of the club's zone as
 * instants, the invited teams only for a tournament (REQ-027), a blank note as null, and the deadline in minutes only
 * when the form offers it for the type (`takesDeadline`, a `confirm` kind, REQ-A07) and it is filled in. REQ-A08: a club
 * place or a typed venue, the opponent only for a sparring or a match, "away" when the form set it, and the gathering
 * time as minutes before the start.
 */
export function eventRequestBody(draft: EventDraft, timeZone: string, takesDeadline = true): EventRequestBody {
  const description = draft.description.trim()
  const hours = takesDeadline ? confirmByHours(draft.confirmByHours?.trim() ?? '') : null
  const venue = locationVenue(draft)
  const gathering = gatheringMinutes(draft.gatheringTime, draft.startTime)
  const opponent = takesOpponent(draft.type) ? draft.opponentExternalTeamId : undefined
  return {
    groupId: draft.groupId,
    type: draft.type,
    name: draft.name.trim(),
    ...(venue ? { venue } : { placeId: draft.placeId }),
    ...(opponent ? { opponentExternalTeamId: opponent } : {}),
    ...(draft.isAway === undefined ? {} : { isAway: draft.isAway }),
    ...(typeof gathering === 'number' ? { gatheringMinutesBefore: gathering } : {}),
    startsAt: zonedInstant(draft.date, draft.startTime, timeZone).toISOString(),
    endsAt: zonedInstant(draft.date, draft.endTime, timeZone).toISOString(),
    invitedExternalTeamIds: draft.type === 'tournament' ? [...new Set(draft.invitedExternalTeamIds)] : [],
    description: description ? description : null,
    ...(hours === null ? {} : { confirmByMinutesBefore: hours * 60 }),
  }
}

const FIELD_OF_CODE: ReadonlyMap<string, EventDraftField> = new Map([
  ['activity_type_requires_team', 'type'],
  ['event_type_not_allowed', 'type'],
  ['activity_times_inverted', 'endTime'],
  ['activity_group_inactive', 'groupId'],
  ['place_not_bookable', 'placeId'],
  ['venue_or_place_required', 'placeId'],
  // 409 outside the place's opening hours (REQ-R19, #288): the message names the day's hours.
  ['event_place_closed', 'startTime'],
  ['occurrence_gathering_after_start', 'gatheringTime'],
  ['occurrence_gathering_too_early', 'gatheringTime'],
  ['occurrence_confirm_by_after_start', 'confirmByHours'],
  ['occurrence_confirm_by_too_early', 'confirmByHours'],
  ['occurrence_confirm_by_in_past', 'confirmByHours'],
])

const FIELD_OF_REFERENCE: ReadonlyMap<string, EventDraftField> = new Map([
  ['groupId', 'groupId'],
  ['placeId', 'placeId'],
])

/** The form field a 422 refusal points at, or null for a refusal the form shows above the fields. */
export function eventFieldOfError(code: string | null, field?: unknown): EventDraftField | null {
  if (!code) return null
  if (code === 'activities_reference_invalid') {
    return typeof field === 'string' ? (FIELD_OF_REFERENCE.get(field) ?? null) : null
  }
  return FIELD_OF_CODE.get(code) ?? null
}
