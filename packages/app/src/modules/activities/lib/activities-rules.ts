// Pure rules of `activities` (club spec glossary *Activity*, *Session*, *Session conflict*, *One-off event*, *Session
// cancellation*; DD-10; foundation II DD-G02…DD-G05): the activity types and which group kinds take them, the session
// status table, the generation horizon, the conflict check over a place tree and a coach, the wall time of an instant
// and the people a cancelled session concerns. Time is a parameter (S3.5); nothing here reads the database.
import {
  addCalendarDays,
  calendarDateInZone,
  defineTransitions,
  findOverlaps,
  isAdultOn,
  occurrenceDates,
  type CalendarDate,
  type DateWindow,
  type Interval,
  type Recurrence,
} from '@vereino/core'

/** `training` (UI: "class" for a class group), `match`, `sparring`, `tournament`, `camp`, `other`. */
export const ACTIVITY_TYPES = ['training', 'match', 'sparring', 'tournament', 'camp', 'other'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** Types only a `team` group takes (club spec DD-03a). */
export const TEAM_ONLY_TYPES: readonly ActivityType[] = ['match', 'sparring']

/** Types a coach may create as a one-off event for their own group without the coordinator (REQ-027). */
export const EVENT_TYPES: readonly ActivityType[] = ['tournament', 'other']

export type GroupKindLike = 'team' | 'class_group'

/** False for `match` and `sparring` on a class group; every other pair is allowed. */
export function typeAllowedForGroup(type: ActivityType, kind: GroupKindLike): boolean {
  return kind === 'team' || !TEAM_ONLY_TYPES.includes(type)
}

export const OCCURRENCE_STATUSES = ['planned', 'done', 'cancelled'] as const
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number]

/**
 * The session transition table (foundation II *Data Models*): `planned → done | cancelled`; the administrator reopens
 * a `cancelled` or `done` session with a reason (`reopen`, a later story). No state is terminal.
 */
export const sessionTransitions = defineTransitions({
  states: OCCURRENCE_STATUSES,
  entry: ['planned'],
  transitions: [
    ['planned', 'done'],
    ['planned', 'cancelled'],
    ['cancelled', 'planned'],
    ['done', 'planned'],
  ],
  terminal: [],
})

/**
 * A stored session a series edit leaves where it is (DD-G03): the club acted on it — cancelled, done, or with
 * checked-off attendance (#33; club spec *Data Models*: re-planning touches sessions "without attendance").
 */
export function isPinnedSession(status: OccurrenceStatus, hasCheckedOffAttendance: boolean): boolean {
  return status !== 'planned' || hasCheckedOffAttendance
}

/** The generation horizon in weeks (club spec DD-10; foundation II keeps the constant, no club setting). */
export const HORIZON_WEEKS = 16

/** The last day of the horizon that starts on `today`. */
export function horizonEnd(today: CalendarDate): CalendarDate {
  return addCalendarDays(today, HORIZON_WEEKS * 7)
}

/**
 * The days a series generates sessions for: from `today` (never the past) or the series' first day, to the horizon
 * end or the series' last day, whichever comes first; null when the window is empty.
 */
export function generationWindow(
  today: CalendarDate,
  startsOn: CalendarDate,
  endsOn: CalendarDate | null,
): DateWindow | null {
  const from = startsOn > today ? startsOn : today
  const end = horizonEnd(today)
  const to = endsOn !== null && endsOn < end ? endsOn : end
  return to < from ? null : { from, to }
}

/** How far ahead a rule without an end is checked for at least one session (one year). */
const OPEN_RULE_PROBE_DAYS = 366

/** True when the rule produces at least one session between its first day and its end (club spec: 0 sessions → 422). */
export function ruleYieldsSessions(rule: Recurrence, startsOn: CalendarDate, endsOn: CalendarDate | null): boolean {
  const to = endsOn ?? addCalendarDays(startsOn, OPEN_RULE_PROBE_DAYS)
  return occurrenceDates(rule, startsOn, { from: startsOn, to }).length > 0
}

/**
 * The last day a series may still have a session — the rule's `UNTIL`, the series' `ends_on`, whichever is earlier;
 * the day itself for a one-off activity — or null when the series is open-ended (a `COUNT` rule is bounded by its
 * dates only when it also has an end).
 */
export function lastSessionDay(
  rule: Recurrence | null,
  startsOn: CalendarDate,
  endsOn: CalendarDate | null,
): CalendarDate | null {
  if (rule === null) return startsOn
  const bounds = [rule.until, endsOn].filter((day): day is CalendarDate => day !== null).sort()
  return bounds[0] ?? null
}

/** The wall time `HH:mm:ss` an instant shows in a time zone. */
export function wallTimeInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const byType = Object.fromEntries(parts.map((entry) => [entry.type, entry.value])) as Record<string, string>
  return `${byType.hour}:${byType.minute}:${byType.second}`
}

/** The club-zone date and wall time of an instant (a one-off event's first day and times). */
export function localDateTime(instant: Date, timeZone: string): { date: CalendarDate; time: string } {
  return { date: calendarDateInZone(instant, timeZone), time: wallTimeInZone(instant, timeZone) }
}

// --- Conflicts (club spec glossary *Session conflict*; foundation II DD-G05) ---

/** A session about to be written: its key (the slot date or the session id) and its instants. */
export type CandidateSession = { readonly key: string; readonly startAt: Date; readonly endAt: Date }

/** A stored `planned` session that may block a candidate. */
export type BlockingSession = {
  readonly id: string
  readonly placeId: string
  readonly coachPersonId: string | null
  readonly startAt: Date
  readonly endAt: Date
}

/** An interval from the optional occupancy provider (a booking, closure or maintenance; phase 5). */
export type ExternalBlock = { readonly id: string; readonly placeId: string; readonly start: Date; readonly end: Date }

export type ConflictInput = {
  readonly candidates: readonly CandidateSession[]
  /** The place every candidate uses, its capacity (`capacity_groups`) and its ancestors and descendants. */
  readonly placeId: string
  readonly capacity: number
  readonly relatedPlaceIds: readonly string[]
  /** The coach every candidate uses, if any: a coach leads one session at a time. */
  readonly coachPersonId: string | null
  readonly existing: readonly BlockingSession[]
  readonly external?: readonly ExternalBlock[]
}

export type ConflictKind = 'place' | 'coach'

export type SessionConflict = {
  readonly key: string
  readonly kind: ConflictKind
  /** Ids of the stored sessions or external blocks the candidate collides with. */
  readonly conflictingIds: readonly string[]
}

const PLACE_RESOURCE = 'place'
const COACH_RESOURCE = 'coach'

/**
 * The conflicts of the candidates (club spec: on the same place, its ancestors or descendants, the overlapping
 * `planned` sessions must not exceed the place's `capacity_groups`; foundation II: a coach is booked once at a time).
 * Sessions on the candidate place's family are re-keyed to the candidate place; external blocks are added as they
 * come; place conflicts are listed before coach conflicts, each in candidate order.
 */
export function sessionConflicts(input: ConflictInput): SessionConflict[] {
  const family = new Set([input.placeId, ...input.relatedPlaceIds])
  const toInterval = (id: string, resourceId: string, start: Date, end: Date): Interval => ({
    id,
    resourceId,
    start,
    end,
  })
  const placeExisting = [
    ...input.existing
      .filter((session) => family.has(session.placeId))
      .map((session) => toInterval(session.id, PLACE_RESOURCE, session.startAt, session.endAt)),
    ...(input.external ?? [])
      .filter((block) => family.has(block.placeId))
      .map((block) => toInterval(block.id, PLACE_RESOURCE, block.start, block.end)),
  ]
  const placeCandidates = input.candidates.map((c) => toInterval(c.key, PLACE_RESOURCE, c.startAt, c.endAt))
  const conflicts: SessionConflict[] = findOverlaps(placeCandidates, placeExisting, () => input.capacity).map(
    (conflict) => ({ key: conflict.candidateId, kind: 'place', conflictingIds: conflict.conflictingIds }),
  )
  if (input.coachPersonId !== null) {
    const coachExisting = input.existing
      .filter((session) => session.coachPersonId === input.coachPersonId)
      .map((session) => toInterval(session.id, COACH_RESOURCE, session.startAt, session.endAt))
    const coachCandidates = input.candidates.map((c) => toInterval(c.key, COACH_RESOURCE, c.startAt, c.endAt))
    for (const conflict of findOverlaps(coachCandidates, coachExisting, () => 1)) {
      conflicts.push({ key: conflict.candidateId, kind: 'coach', conflictingIds: conflict.conflictingIds })
    }
  }
  return conflicts
}

// --- Cancellation notice (club spec glossary *Session cancellation*; #31) ---

export type RosterMember = { readonly personId: string; readonly role: 'participant' | 'coach' | 'assistant' }

export type CancellationAudience = {
  /** The group's memberships active on the session date. */
  readonly roster: readonly RosterMember[]
  /** The session's coach (null = unassigned). */
  readonly coachPersonId: string | null
  /** Birth dates of the participants (null = unknown). */
  readonly birthDates: ReadonlyMap<string, CalendarDate | null>
  /** Active guardians of each participant, by participant id. */
  readonly guardiansByWard: ReadonlyMap<string, readonly string[]>
  /** The `auth` user of every person with an account. */
  readonly userIds: ReadonlyMap<string, string>
  /** The session date: a participant is a minor unless known to be 18 on it. */
  readonly onDate: CalendarDate
  /** The user who cancelled; they are not notified of their own action. */
  readonly actorUserId: string | null
}

/** The persons whose accounts may receive the notice: participants, guardians of minors, the coaches. */
export function cancellationPersonIds(audience: Omit<CancellationAudience, 'userIds' | 'actorUserId'>): string[] {
  const persons = new Set<string>()
  for (const member of audience.roster) {
    persons.add(member.personId)
    if (member.role !== 'participant') continue
    const birthDate = audience.birthDates.get(member.personId) ?? null
    if (birthDate !== null && isAdultOn(birthDate, audience.onDate)) continue
    for (const guardian of audience.guardiansByWard.get(member.personId) ?? []) persons.add(guardian)
  }
  if (audience.coachPersonId !== null) persons.add(audience.coachPersonId)
  return [...persons].sort()
}

/**
 * The users notified of a cancellation (club spec glossary *Session cancellation*; #31 criterion): participants with
 * an account, the guardians (with an account) of every participant not known to be an adult, and the coaches — the
 * session's coach and the group's coaches and assistants — sorted, without the user who cancelled.
 */
export function cancellationRecipients(audience: CancellationAudience): string[] {
  const users = new Set<string>()
  for (const personId of cancellationPersonIds(audience)) {
    const userId = audience.userIds.get(personId)
    if (userId && userId !== audience.actorUserId) users.add(userId)
  }
  return [...users].sort()
}
