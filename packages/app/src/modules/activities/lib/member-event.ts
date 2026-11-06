// The coach's phone form for a one-off event (club spec REQ-027, *UI architecture* "New event"; #140): the options it
// offers — the groups the coach coaches, with their section, and the bookable leaves of the club's places — the
// checks it runs before sending, the request body of `POST /api/activities/events` with the instants in the club's
// time zone, and the form field a refusal points at. Pure.
import { isCalendarDate, isLocalTime, zonedInstant } from '@vereino/core'
import { EVENT_TYPES, type ActivityType, type GroupKindLike } from './activities-rules'

/** The limits of the event's name and note, as `eventCreateSchema` sets them. */
export const EVENT_NAME_MAX = 200
export const EVENT_NOTE_MAX = 4000

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

export type EventPlaceSource = { id: string; name: string; parentName: string | null; isLeaf: boolean }
export type EventPlaceOption = { id: string; label: string }

/** The places a session may point to (a leaf: a complex is booked through its pitches), "Complex › Pitch", by label. */
export function eventPlaceOptions(places: readonly EventPlaceSource[]): EventPlaceOption[] {
  return places
    .filter((place) => place.isLeaf)
    .map((place) => ({ id: place.id, label: place.parentName ? `${place.parentName} › ${place.name}` : place.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pl') || a.id.localeCompare(b.id))
}

/** What the coach filled in: one day with a start and an end in the club's time zone. */
export type EventDraft = {
  groupId: string
  type: string
  name: string
  placeId: string
  date: string
  startTime: string
  endTime: string
  invitedExternalTeamIds: readonly string[]
  description: string
}

export type EventDraftField = 'groupId' | 'type' | 'name' | 'placeId' | 'date' | 'startTime' | 'endTime'
export type EventDraftProblem = 'required' | 'invalid' | 'endBeforeStart'
export type EventDraftProblems = Partial<Record<EventDraftField, EventDraftProblem>>

function isEventType(value: string): value is ActivityType {
  return (EVENT_TYPES as readonly string[]).includes(value)
}

/** The problems that keep the form from sending; an empty object means it may be sent. */
export function eventDraftProblems(draft: EventDraft): EventDraftProblems {
  const problems: EventDraftProblems = {}
  if (!draft.groupId) problems.groupId = 'required'
  if (!draft.type) problems.type = 'required'
  else if (!isEventType(draft.type)) problems.type = 'invalid'
  if (!draft.name.trim()) problems.name = 'required'
  else if (draft.name.trim().length > EVENT_NAME_MAX) problems.name = 'invalid'
  if (!draft.placeId) problems.placeId = 'required'
  if (!draft.date) problems.date = 'required'
  else if (!isCalendarDate(draft.date)) problems.date = 'invalid'
  for (const field of ['startTime', 'endTime'] as const) {
    if (!draft[field]) problems[field] = 'required'
    else if (!isLocalTime(draft[field])) problems[field] = 'invalid'
  }
  if (!problems.startTime && !problems.endTime && draft.endTime <= draft.startTime) problems.endTime = 'endBeforeStart'
  return problems
}

export type EventRequestBody = {
  groupId: string
  type: string
  name: string
  placeId: string
  startsAt: string
  endsAt: string
  invitedExternalTeamIds: string[]
  description: string | null
}

/**
 * The body of `POST /api/activities/events` for a draft without problems: the wall times of the club's zone as
 * instants, the invited teams only for a tournament (REQ-027), a blank note as null.
 */
export function eventRequestBody(draft: EventDraft, timeZone: string): EventRequestBody {
  const description = draft.description.trim()
  return {
    groupId: draft.groupId,
    type: draft.type,
    name: draft.name.trim(),
    placeId: draft.placeId,
    startsAt: zonedInstant(draft.date, draft.startTime, timeZone).toISOString(),
    endsAt: zonedInstant(draft.date, draft.endTime, timeZone).toISOString(),
    invitedExternalTeamIds: draft.type === 'tournament' ? [...new Set(draft.invitedExternalTeamIds)] : [],
    description: description ? description : null,
  }
}

const FIELD_OF_CODE: ReadonlyMap<string, EventDraftField> = new Map([
  ['activity_type_requires_team', 'type'],
  ['event_type_not_allowed', 'type'],
  ['activity_times_inverted', 'endTime'],
  ['activity_group_inactive', 'groupId'],
  ['place_not_bookable', 'placeId'],
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
