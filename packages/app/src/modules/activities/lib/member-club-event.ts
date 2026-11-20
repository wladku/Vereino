// The phone forms of a club event and its parts (club events spec REQ-T12, UI rows `/club/club-events/*`; E14-S05,
// #380): the drafts the forms start from (a new event with the caller's only section, a stored event, a new part with
// the event's default gathering and deadline, a copy of a part — everything but the day and the group — and a stored
// part), the checks they run before sending, the request bodies of `POST`/`PUT /api/activities/club-events` and
// `POST`/`PUT /api/activities/club-events/{id}/parts[/{partId}]` with the wall times of the club's zone as instants, and
// the form field a coded refusal points at. Pure.
import { isCalendarDate, isLocalTime, zonedInstant } from '@vereino/core'
import { EVENT_TYPES, MAX_CONFIRM_BY_HOURS, localDateTime } from './activities-rules'
import {
  CLUB_EVENT_DESCRIPTION_MAX,
  CLUB_EVENT_NAME_MAX,
  CLUB_EVENT_NAME_MIN,
  PART_CATEGORY_MAX,
  PART_TITLE_MAX,
  PART_TITLE_MIN,
  isClubEventSlug,
  minutesBefore,
  type PartKind,
} from './club-events'
import { MAX_GATHERING_MINUTES } from './gathering'

/** The select value of a whole-club event (a select item cannot hold an empty or null value). */
export const WHOLE_CLUB = '__club__'
/** The select value of an open part ("No club group"). */
export const NO_GROUP = '__none__'

export type DraftProblem = 'required' | 'invalid' | 'endBeforeStart'

/** A whole number in 1…max, null for an empty text, or `invalid`. */
export function wholeNumberIn(text: string, max: number): number | null | 'invalid' {
  const value = text.trim()
  if (!value) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= max ? number : 'invalid'
}

// --- The club event form (`/club/club-events/new`, `/club/club-events/[id]/edit`; B-T2 on the phone) ---

export type ClubEventDraft = {
  name: string
  publicSlug: string
  /** A section id, `WHOLE_CLUB`, or '' while none is chosen. */
  sectionId: string
  placeId: string
  description: string
  isPublic: boolean
  /** Minutes before the start, as typed. */
  gatheringMinutes: string
  /** Hours before the start, as typed. */
  confirmByHours: string
}

export type ClubEventDraftField = Exclude<keyof ClubEventDraft, 'isPublic'>
export type ClubEventDraftProblems = Partial<Record<ClubEventDraftField, DraftProblem>>

/** The stored event as the edit form starts from it (`GET /api/activities/club-events/{id}`). */
export type StoredClubEvent = {
  name: string | null
  publicSlug: string | null
  sectionId: string | null
  placeId: string | null
  description: string | null
  isPublic: boolean
  gatheringMinutesBefore: number | null
  confirmByMinutesBefore: number | null
}

const text = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value))

/**
 * The draft of a new event — the caller's only section preselected (J-T01 step 1), "Whole club" first for the
 * administrator — or of a stored one.
 */
export function clubEventDraft(
  event: StoredClubEvent | null,
  options: { wholeClub: boolean; sections: readonly { id: string }[] },
): ClubEventDraft {
  if (event) {
    return {
      name: event.name ?? '',
      publicSlug: event.publicSlug ?? '',
      sectionId: event.sectionId ?? WHOLE_CLUB,
      placeId: event.placeId ?? '',
      description: event.description ?? '',
      isPublic: event.isPublic,
      gatheringMinutes: text(event.gatheringMinutesBefore),
      confirmByHours:
        event.confirmByMinutesBefore === null ? '' : String(Math.round(event.confirmByMinutesBefore / 60)),
    }
  }
  const sectionId = options.wholeClub ? WHOLE_CLUB : options.sections.length === 1 ? options.sections[0].id : ''
  return {
    name: '',
    publicSlug: '',
    sectionId,
    placeId: '',
    description: '',
    isPublic: false,
    gatheringMinutes: '',
    confirmByHours: '',
  }
}

/** The problems that keep the event form from sending; an empty object means it may be sent. */
export function clubEventDraftProblems(draft: ClubEventDraft): ClubEventDraftProblems {
  const problems: ClubEventDraftProblems = {}
  const name = draft.name.trim()
  if (!name) problems.name = 'required'
  else if (name.length < CLUB_EVENT_NAME_MIN || name.length > CLUB_EVENT_NAME_MAX) problems.name = 'invalid'
  const slug = draft.publicSlug.trim()
  if (slug && !isClubEventSlug(slug)) problems.publicSlug = 'invalid'
  if (!draft.sectionId) problems.sectionId = 'required'
  if (!draft.placeId) problems.placeId = 'required'
  if (draft.description.trim().length > CLUB_EVENT_DESCRIPTION_MAX) problems.description = 'invalid'
  if (wholeNumberIn(draft.gatheringMinutes, MAX_GATHERING_MINUTES) === 'invalid') problems.gatheringMinutes = 'invalid'
  if (wholeNumberIn(draft.confirmByHours, MAX_CONFIRM_BY_HOURS) === 'invalid') problems.confirmByHours = 'invalid'
  return problems
}

export type ClubEventRequestBody = {
  name: string
  publicSlug?: string
  sectionId: string | null
  placeId: string
  description: string | null
  isPublic: boolean
  gatheringMinutesBefore: number | null
  confirmByMinutesBefore: number | null
}

/**
 * The body of `POST`/`PUT /api/activities/club-events` for a draft without problems: an empty slug is left out (the
 * server proposes it from the name), "Whole club" is `sectionId: null`, a blank description null, the deadline in
 * minutes.
 */
export function clubEventRequestBody(draft: ClubEventDraft): ClubEventRequestBody {
  const slug = draft.publicSlug.trim()
  const description = draft.description.trim()
  const gathering = wholeNumberIn(draft.gatheringMinutes, MAX_GATHERING_MINUTES)
  const hours = wholeNumberIn(draft.confirmByHours, MAX_CONFIRM_BY_HOURS)
  return {
    name: draft.name.trim(),
    ...(slug ? { publicSlug: slug } : {}),
    sectionId: draft.sectionId === WHOLE_CLUB ? null : draft.sectionId,
    placeId: draft.placeId,
    description: description ? description : null,
    isPublic: draft.isPublic,
    gatheringMinutesBefore: typeof gathering === 'number' ? gathering : null,
    confirmByMinutesBefore: typeof hours === 'number' ? hours * 60 : null,
  }
}

const EVENT_FIELD_OF_CODE: ReadonlyMap<string, ClubEventDraftField> = new Map([
  ['club_event_slug_taken', 'publicSlug'],
  ['club_event_slug_invalid', 'publicSlug'],
  ['club_event_section_fixed', 'sectionId'],
  ['scope_denied', 'sectionId'],
  ['place_not_bookable', 'placeId'],
  ['club_event_open_part_needs_external_place', 'placeId'],
  ['event_place_closed', 'placeId'],
])

/** The event form field a refusal points at, or null for one the form shows above the fields. */
export function clubEventFieldOfError(code: string | null): ClubEventDraftField | null {
  return code ? (EVENT_FIELD_OF_CODE.get(code) ?? null) : null
}

// --- The part form (`/club/club-events/[id]/parts/new`, `/parts/[partId]/edit`; the part dialog on the phone) ---

export type PartDraft = {
  title: string
  /** The club-zone day and wall times; a stored part with a group keeps its own (they change through Move). */
  date: string
  startTime: string
  endTime: string
  /** A group id, `NO_GROUP`, or '' while none is chosen. */
  groupId: string
  categoryLabel: string
  type: string
  /** A coach's person id, or '' for none. */
  coachPersonId: string
  gatheringMinutes: string
  confirmByHours: string
  visitingTeamIds: string[]
}

export type PartDraftField = Exclude<keyof PartDraft, 'visitingTeamIds'> | 'visitingTeamIds'
export type PartDraftProblems = Partial<Record<PartDraftField, DraftProblem>>

/** A stored part as the event read lists it (`parts[]` of `GET /api/activities/club-events/{id}`). */
export type StoredPart = {
  kind: PartKind
  title: string
  categoryLabel: string | null
  type: string
  groupId: string | null
  startAt: string | null
  endAt: string | null
  coachPersonId: string | null
  gatheringAt: string | null
  confirmBy: string | null
  visitingTeamIds: readonly string[]
}

export type PartDraftSource =
  | { kind: 'create'; event: { gatheringMinutesBefore: number | null; confirmByMinutesBefore: number | null } }
  | { kind: 'copy'; part: StoredPart }
  | { kind: 'edit'; part: StoredPart }

function wall(instant: string | null, timeZone: string): { date: string; time: string } {
  if (!instant || Number.isNaN(Date.parse(instant))) return { date: '', time: '' }
  const local = localDateTime(new Date(instant), timeZone)
  return { date: local.date, time: local.time.slice(0, 5) }
}

/**
 * The draft of the part form: a new part with the event's defaults; a copy with everything but the day and the group
 * (glossary *Copying a part*) and without the coach, who belongs to the group; a stored part as it is.
 */
export function partDraft(source: PartDraftSource, timeZone: string): PartDraft {
  if (source.kind === 'create') {
    return {
      title: '',
      date: '',
      startTime: '',
      endTime: '',
      groupId: '',
      categoryLabel: '',
      type: 'tournament',
      coachPersonId: '',
      gatheringMinutes: text(source.event.gatheringMinutesBefore),
      confirmByHours:
        source.event.confirmByMinutesBefore === null
          ? ''
          : String(Math.round(source.event.confirmByMinutesBefore / 60)),
      visitingTeamIds: [],
    }
  }
  const { part } = source
  const start = wall(part.startAt, timeZone)
  const end = wall(part.endAt, timeZone)
  const confirmMinutes = part.kind === 'group' ? minutesBefore(part.confirmBy, part.startAt) : null
  const editing = source.kind === 'edit'
  return {
    title: part.title,
    date: editing ? start.date : '',
    startTime: start.time,
    endTime: end.time,
    groupId: editing ? (part.groupId ?? NO_GROUP) : '',
    categoryLabel: part.categoryLabel ?? '',
    type: part.type,
    coachPersonId: editing ? (part.coachPersonId ?? '') : '',
    gatheringMinutes: part.kind === 'group' ? text(minutesBefore(part.gatheringAt, part.startAt)) : '',
    confirmByHours: confirmMinutes === null ? '' : String(Math.round(confirmMinutes / 60)),
    visitingTeamIds: [...part.visitingTeamIds],
  }
}

/** How the part form is filled in: a stored part with a group keeps its day, times, group and coach. */
export type PartFormShape = {
  /** The form changes a stored part (its group and coach are fixed). */
  editing: boolean
  /** The day and times are read-only (a stored part with a group: they change through Move). */
  fixedTimes: boolean
}

/** The problems that keep the part form from sending; an empty object means it may be sent. */
export function partDraftProblems(draft: PartDraft, shape: PartFormShape): PartDraftProblems {
  const problems: PartDraftProblems = {}
  const title = draft.title.trim()
  if (!title) problems.title = 'required'
  else if (title.length < PART_TITLE_MIN || title.length > PART_TITLE_MAX) problems.title = 'invalid'
  if (!shape.fixedTimes) {
    if (!draft.date) problems.date = 'required'
    else if (!isCalendarDate(draft.date)) problems.date = 'invalid'
    for (const field of ['startTime', 'endTime'] as const) {
      if (!draft[field]) problems[field] = 'required'
      else if (!isLocalTime(draft[field])) problems[field] = 'invalid'
    }
    if (!problems.startTime && !problems.endTime && draft.endTime <= draft.startTime) {
      problems.endTime = 'endBeforeStart'
    }
  }
  if (!shape.editing && !draft.groupId) problems.groupId = 'required'
  if (draft.categoryLabel.trim().length > PART_CATEGORY_MAX) problems.categoryLabel = 'invalid'
  if (!draft.type) problems.type = 'required'
  else if (!(EVENT_TYPES as readonly string[]).includes(draft.type)) problems.type = 'invalid'
  if (wholeNumberIn(draft.gatheringMinutes, MAX_GATHERING_MINUTES) === 'invalid') problems.gatheringMinutes = 'invalid'
  if (wholeNumberIn(draft.confirmByHours, MAX_CONFIRM_BY_HOURS) === 'invalid') problems.confirmByHours = 'invalid'
  return problems
}

export type PartRequestBody = {
  title: string
  categoryLabel: string | null
  type: string
  visitingTeamIds: string[]
  groupId?: string | null
  startsAt?: string
  endsAt?: string
  coachPersonId?: string
  gatheringMinutesBefore?: number | null
  confirmByMinutesBefore?: number | null
}

/**
 * The body of `POST /api/activities/club-events/{id}/parts` (a new part) or `PUT …/parts/{partId}` (a stored one) for
 * a draft without problems. A part with a group carries the gathering and — when the club asks for a confirmation of
 * the type (`deadlineShown`) — the deadline; an open part has no session and carries neither. A new part carries its
 * group and coach; a stored one never does (the coach changes through Change coach). The day and times go as instants
 * of the club's zone unless they are fixed.
 */
export function partRequestBody(
  draft: PartDraft,
  options: PartFormShape & { timeZone: string; groupPart: boolean; deadlineShown: boolean },
): PartRequestBody {
  const category = draft.categoryLabel.trim()
  const gathering = wholeNumberIn(draft.gatheringMinutes, MAX_GATHERING_MINUTES)
  const hours = options.deadlineShown ? wholeNumberIn(draft.confirmByHours, MAX_CONFIRM_BY_HOURS) : null
  const body: PartRequestBody = {
    title: draft.title.trim(),
    categoryLabel: category ? category : null,
    type: draft.type,
    visitingTeamIds: [...new Set(draft.visitingTeamIds)],
  }
  if (options.groupPart) {
    body.gatheringMinutesBefore = typeof gathering === 'number' ? gathering : null
    body.confirmByMinutesBefore = typeof hours === 'number' ? hours * 60 : null
  }
  if (!options.fixedTimes) {
    body.startsAt = zonedInstant(draft.date, draft.startTime, options.timeZone).toISOString()
    body.endsAt = zonedInstant(draft.date, draft.endTime, options.timeZone).toISOString()
  }
  if (!options.editing) {
    body.groupId = draft.groupId === NO_GROUP ? null : draft.groupId
    if (options.groupPart && draft.coachPersonId) body.coachPersonId = draft.coachPersonId
  }
  return body
}

const PART_FIELD_OF_CODE: ReadonlyMap<string, PartDraftField> = new Map([
  ['club_event_part_outside_section', 'groupId'],
  ['club_event_open_part_needs_external_place', 'groupId'],
  ['club_event_part_group_fixed', 'groupId'],
  ['activity_group_inactive', 'groupId'],
  ['activity_type_requires_team', 'type'],
  ['event_type_not_allowed', 'type'],
  ['activity_times_inverted', 'endTime'],
  // 409 outside the place's opening hours (REQ-R19): the message names the day's hours.
  ['event_place_closed', 'startTime'],
  ['occurrence_gathering_after_start', 'gatheringMinutes'],
  ['occurrence_gathering_too_early', 'gatheringMinutes'],
  ['occurrence_confirm_by_after_start', 'confirmByHours'],
  ['occurrence_confirm_by_too_early', 'confirmByHours'],
  ['occurrence_confirm_by_in_past', 'confirmByHours'],
])

const PART_FIELD_OF_REFERENCE: ReadonlyMap<string, PartDraftField> = new Map([
  ['groupId', 'groupId'],
  ['coachPersonId', 'coachPersonId'],
  ['visitingTeamIds', 'visitingTeamIds'],
])

/** The part form field a refusal points at, or null for one the form shows above the fields. */
export function partFieldOfError(code: string | null, field?: unknown): PartDraftField | null {
  if (!code) return null
  if (code === 'activities_reference_invalid') {
    return typeof field === 'string' ? (PART_FIELD_OF_REFERENCE.get(field) ?? null) : null
  }
  return PART_FIELD_OF_CODE.get(code) ?? null
}

/** The club-zone day of a part's start (`YYYY-MM-DD`), '' without one: the day headings of the phone event page. */
export function partDayInZone(startAt: string | null | undefined, timeZone: string): string {
  return wall(startAt ?? null, timeZone).date
}

/** The club-zone wall times of a part, "09:00–14:00" (or the one it has). */
export function partTimeRangeInZone(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  timeZone: string,
): string {
  const start = wall(startAt ?? null, timeZone).time
  const end = wall(endAt ?? null, timeZone).time
  return start && end ? `${start}–${end}` : start || end
}
