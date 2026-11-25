// The pure rules of club events and their parts (club events spec DD-T01…DD-T07, DD-T13, glossary rows *Club event*,
// *Part*, *Open part*, *Event dates*, *Event place*, *Copying a part*; REQ-T01, REQ-T02, REQ-T05; TEST-T15): the
// limits, the slug proposed from a name, the kind of a part, the open-part rule, the event's dates, which part
// sessions a change of the event's place moves, the public path and the copy prefill. No database, no framework.
import { EVENT_TYPES, type ActivityType } from './activities-rules'

export const CLUB_EVENT_STATUSES = ['planned', 'cancelled'] as const
export type ClubEventStatus = (typeof CLUB_EVENT_STATUSES)[number]

/** The types a part takes (DD-T02): the one-off event types; `match` and `sparring` only for a team. */
export const PART_TYPES: readonly ActivityType[] = EVENT_TYPES

export const CLUB_EVENT_NAME_MIN = 2
export const CLUB_EVENT_NAME_MAX = 160
export const CLUB_EVENT_SLUG_MIN = 3
export const CLUB_EVENT_SLUG_MAX = 80
export const CLUB_EVENT_DESCRIPTION_MAX = 4000
export const CLUB_EVENT_REASON_MIN = 3
export const CLUB_EVENT_REASON_MAX = 500
export const PART_TITLE_MIN = 2
export const PART_TITLE_MAX = 160
export const PART_CATEGORY_MAX = 60
/** At most 40 live parts per club event (422 `club_event_parts_limit`). */
export const MAX_PARTS = 40
/** At most 32 visiting teams per part. */
export const MAX_VISITING_TEAMS = 32

/** `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–80 characters (DD-T13). */
export const CLUB_EVENT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Whether `slug` is a valid public slug of a club event. */
export function isClubEventSlug(slug: string): boolean {
  return slug.length >= CLUB_EVENT_SLUG_MIN && slug.length <= CLUB_EVENT_SLUG_MAX && CLUB_EVENT_SLUG_PATTERN.test(slug)
}

/**
 * The slug proposed from a name (DD-T13): letters without diacritics, lower case, every other run of characters one
 * hyphen, at most 80 characters without a trailing hyphen — "PRZYKŁAD CUP 2026" → `przyklad-cup-2026`. Null when the
 * name leaves fewer than 3 characters, so the caller asks for a slug.
 */
export function proposeClubEventSlug(name: string): string | null {
  const ascii = name.replace(/[łŁ]/g, 'l').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const slug = ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CLUB_EVENT_SLUG_MAX)
    .replace(/-+$/, '')
  return isClubEventSlug(slug) ? slug : null
}

/** A part with a group owns an activity; an open part (no club group) keeps its own times and status (DD-T04). */
export type PartKind = 'group' | 'open'

export function partKind(part: { activityId?: string | null }): PartKind {
  return part.activityId ? 'group' : 'open'
}

/**
 * An open part is allowed only while the event's place is external (DD-T04): at a club place it would hold the place
 * without the facility occupancy knowing. Null when the part may exist.
 */
export function openPartProblem(
  hasGroup: boolean,
  placeExternal: boolean,
): 'club_event_open_part_needs_external_place' | null {
  return !hasGroup && !placeExternal ? 'club_event_open_part_needs_external_place' : null
}

/** Whether one more part would exceed the 40 live parts of an event. */
export function partsLimitReached(liveParts: number): boolean {
  return liveParts >= MAX_PARTS
}

/**
 * Who a part's group may be (glossary *Event section*): any group for a whole-club event, a group of the event's
 * section otherwise. Null when the group fits.
 */
export function partSectionProblem(
  eventSectionId: string | null,
  groupSectionId: string,
): 'club_event_part_outside_section' | null {
  return eventSectionId !== null && eventSectionId !== groupSectionId ? 'club_event_part_outside_section' : null
}

/** The section of an event changes only while it has no live part (422 `club_event_section_fixed`). */
export function sectionChangeProblem(
  before: string | null,
  after: string | null,
  liveParts: number,
): 'club_event_section_fixed' | null {
  return before !== after && liveParts > 0 ? 'club_event_section_fixed' : null
}

/** A part's time span: its session's for a part with a group, its own for an open part. */
export type PartSpan = { startAt: Date; endAt: Date }

/**
 * The event's dates (glossary *Event dates*): from the first part's start date to the last part's end date in the
 * club's zone; null while the event has no part.
 */
export function clubEventDates(
  parts: readonly PartSpan[],
  timeZone: string,
): { dateFrom: string; dateTo: string } | null {
  if (parts.length === 0) return null
  const start = Math.min(...parts.map((part) => part.startAt.getTime()))
  const end = Math.max(...parts.map((part) => part.endAt.getTime()))
  return { dateFrom: zoneDate(new Date(start), timeZone), dateTo: zoneDate(new Date(end), timeZone) }
}

function zoneDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    instant,
  )
}

/**
 * The part sessions a change of the event's place moves and a cancellation of the event cancels (glossary *Event
 * place*, DD-T14): the `planned` ones that start after `now`; a cancelled, done or past session is left as it is.
 */
export function futurePlannedSessions<T extends { status: string; startAt: Date }>(
  sessions: readonly T[],
  now: Date,
): T[] {
  return sessions.filter((session) => session.status === 'planned' && session.startAt.getTime() > now.getTime())
}

/** The tournament page of a published club event (DD-T13), or null while it is not public. */
export function clubEventPublicPath(clubSlug: string | null, eventSlug: string, isPublic: boolean): string | null {
  return isPublic && clubSlug ? `/p/${clubSlug}/events/${eventSlug}` : null
}

/** What a copied part takes over (glossary *Copying a part*): everything except the day and the group. */
export type PartCopySource = {
  title: string
  categoryLabel: string | null
  type: ActivityType
  startTime: string
  endTime: string
  gatheringMinutesBefore: number | null
  confirmByMinutesBefore: number | null
  visitingTeamIds: readonly string[]
}

export type PartCopyPrefill = Omit<PartCopySource, 'visitingTeamIds'> & {
  visitingTeamIds: string[]
  date: null
  groupId: null
}

export function partCopyPrefill(source: PartCopySource): PartCopyPrefill {
  return {
    title: source.title,
    categoryLabel: source.categoryLabel,
    type: source.type,
    startTime: source.startTime,
    endTime: source.endTime,
    gatheringMinutesBefore: source.gatheringMinutesBefore,
    confirmByMinutesBefore: source.confirmByMinutesBefore,
    visitingTeamIds: [...source.visitingTeamIds],
    date: null,
    groupId: null,
  }
}

// --- The panel's Parts tab (club events spec B-T3, REQ-T11; #378) ---

/** One day of the Parts tab: its date (`YYYY-MM-DD`) and its parts in the order they came. */
export type PartDay<T> = { date: string; parts: T[] }

/**
 * The parts grouped by day for the Parts tab (B-T3): days in date order, each part on the day `dayOf` gives it
 * (the reader's local date of its start); a part without a day goes to a last group with the date ''. The parts keep
 * the order they came in (the record reads them sorted by start, then title).
 */
export function partsByDay<T>(parts: readonly T[], dayOf: (part: T) => string): PartDay<T>[] {
  const days = new Map<string, T[]>()
  for (const part of parts) {
    const date = dayOf(part)
    const list = days.get(date)
    if (list) list.push(part)
    else days.set(date, [part])
  }
  const undated = days.get('')
  days.delete('')
  const dated = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, parts: list }))
  return undated ? [...dated, { date: '', parts: undated }] : dated
}

export type PartAction = 'edit' | 'copy' | 'move' | 'cancel' | 'remove'

/**
 * The row actions of a part (B-T3): nothing unless the caller manages a planned event; a planned part with a group
 * Edit, Copy, Move, Cancel, Remove, a planned open part the same without Move (it has no session); a cancelled or done
 * part only Copy, and a cancelled open part also Remove (the server removes an open part always, a part with a group
 * only while its session is planned and unused).
 */
export function partActions(
  part: { kind: PartKind; status: string | null },
  event: { mayManage: boolean; status: string | null },
): PartAction[] {
  if (!event.mayManage || event.status !== 'planned') return []
  if (part.status === 'planned') {
    return part.kind === 'group' ? ['edit', 'copy', 'move', 'cancel', 'remove'] : ['edit', 'copy', 'cancel', 'remove']
  }
  return part.kind === 'open' ? ['copy', 'remove'] : ['copy']
}

/** Whole minutes from an earlier instant to a later one (a gathering or deadline offset), or null without both. */
export function minutesBefore(earlier: string | null | undefined, start: string | null | undefined): number | null {
  if (!earlier || !start) return null
  const from = Date.parse(earlier)
  const to = Date.parse(start)
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) return null
  return Math.round((to - from) / 60_000)
}
