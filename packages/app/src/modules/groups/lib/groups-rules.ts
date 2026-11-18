// Pure rules of the `groups` module (club spec glossary *Group*, *Membership*, *Coach / instructor*; DD-03a): the
// group kinds and membership roles, the team-only fields, membership periods and the season dates. Time is a
// parameter (engineering standards S3.5); nothing here reads the database.
import {
  endsBefore,
  isActiveAt,
  isInvertedPeriod,
  periodsOverlap,
  type CalendarDate,
  type Validity,
} from '@vereino/core'

/** `team` (e.g. Żaki) or `class_group` (e.g. "Basen — początkujący"); both kinds follow the same rules. */
export const GROUP_KINDS = ['team', 'class_group'] as const
export type GroupKind = (typeof GROUP_KINDS)[number]

/** The membership roles; `coach` and `assistant` lead the group (the UI says "instructor" for a class group). */
export const MEMBERSHIP_ROLES = ['participant', 'coach', 'assistant'] as const
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number]

/** Roles whose active membership puts the group in the person's `coached_group_ids`. */
export const COACHING_ROLES: readonly MembershipRole[] = ['coach', 'assistant']

export function isCoachingRole(role: MembershipRole): boolean {
  return COACHING_ROLES.includes(role)
}

/** The age bounds a group may publish, in completed years (#91). */
export const GROUP_AGE_MIN = 0
export const GROUP_AGE_MAX = 99

/** True when both age bounds are set and the youngest age is above the oldest (club spec: from ≤ to → else 422). */
export function ageRangeInverted(ageFrom: number | null, ageTo: number | null): boolean {
  return ageFrom !== null && ageTo !== null && ageFrom > ageTo
}

/**
 * An age bound as typed in a form (#91): blank → null (open), a whole number of years in range → the number, anything
 * else → `invalid`.
 */
export function parseAgeInput(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined) return null
  const textValue = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : null
  if (textValue === null) return 'invalid'
  if (textValue === '') return null
  // One or two digits: exactly the range GROUP_AGE_MIN…GROUP_AGE_MAX.
  return /^\d{1,2}$/.test(textValue) ? Number(textValue) : 'invalid'
}

/** The fields only a `team` may carry: the PZPN age category (a `dictionaries` entry), the league and the season. */
export const TEAM_FIELDS = ['ageCategoryEntryId', 'league', 'seasonId'] as const
export type TeamField = (typeof TEAM_FIELDS)[number]

export type TeamFieldValues = { readonly [field in TeamField]?: string | null }

/**
 * The team fields set on a group of kind `kind` that the kind does not allow (club spec: team fields for a
 * `class_group` → 422); an empty list when the group is valid. Null, undefined and blank values count as unset.
 */
export function disallowedTeamFields(kind: GroupKind, values: TeamFieldValues): TeamField[] {
  if (kind === 'team') return []
  return TEAM_FIELDS.filter((field) => {
    const value = values[field]
    return typeof value === 'string' && value.trim().length > 0
  })
}

/**
 * Whether a kind change needs the match guard (parity spec REQ-A02, #266): only a `team` that becomes a `class_group`
 * can strand matches and sparrings, which a class group may not have.
 */
export function needsMatchGuard(from: GroupKind, to: GroupKind): boolean {
  return from === 'team' && to === 'class_group'
}

/** The key of the club dictionary (`dictionaries` module) that holds the age categories of `team` groups. */
export const AGE_CATEGORY_DICTIONARY_KEY = 'groups.age_categories'

export type AgeCategorySeed = { readonly value: string; readonly label: string }

/**
 * The PZPN (Polish Football Association) age categories the club's age category dictionary starts with (club spec
 * REQ-019, #92), youngest first, preceded by the academy's youngest group "Kids" (ages 4–5, the mockup's `g-kids`;
 * people life-cycle spec phase L3, approved on #255). Labels are the names with their age groups; the club
 * administrator edits them. Seeded only for a new club: an existing club adds "Kids" in place from the group form.
 */
export const PZPN_AGE_CATEGORIES: readonly AgeCategorySeed[] = [
  { value: 'kids', label: 'Kids (U4–U5)' },
  { value: 'skrzat', label: 'Skrzat (U6–U7)' },
  { value: 'zak', label: 'Żak (U8–U9)' },
  { value: 'orlik', label: 'Orlik (U10–U11)' },
  { value: 'mlodzik', label: 'Młodzik (U12–U13)' },
  { value: 'trampkarz', label: 'Trampkarz (U14–U15)' },
  { value: 'junior_mlodszy', label: 'Junior młodszy (U16–U17)' },
  { value: 'junior_starszy', label: 'Junior starszy (U18–U19)' },
  { value: 'senior', label: 'Senior' },
]

/** A season's last day may equal its first day, never precede it. */
export function seasonDatesInverted(startsOn: CalendarDate, endsOn: CalendarDate): boolean {
  return isInvertedPeriod(startsOn, endsOn)
}

/**
 * The first existing period that overlaps `candidate` (inclusive calendar days; an empty end is open-ended), or null.
 * Two memberships of the same person, group and role must not overlap (club spec: overlap → 409).
 */
export function firstOverlapping<T extends Validity>(candidate: Validity, existing: readonly T[]): T | null {
  return existing.find((period) => periodsOverlap(candidate, period)) ?? null
}

export type PeriodStatus = 'active' | 'ended' | 'upcoming'

/** Whether a membership period is active, already ended or still to start on `today` (in the club zone). */
export function periodStatus(period: Validity, today: CalendarDate): PeriodStatus {
  if (isActiveAt(period, today)) return 'active'
  return endsBefore(period, today) ? 'ended' : 'upcoming'
}

const STATUS_ORDER: Readonly<Record<PeriodStatus, number>> = { active: 0, upcoming: 1, ended: 2 }

/**
 * The roster order: active memberships first, then upcoming, then ended (the history); within each, the latest start
 * first. Returns a new array.
 */
export function rosterOrder<T extends Validity>(rows: readonly T[], today: CalendarDate): T[] {
  return [...rows].sort(
    (a, b) =>
      STATUS_ORDER[periodStatus(a, today)] - STATUS_ORDER[periodStatus(b, today)] ||
      b.validFrom.localeCompare(a.validFrom),
  )
}

/** The roster views of B-12 (parity spec REQ-A03, #267); `ended` is the History view. */
export const ROSTER_VIEWS = ['active', 'upcoming', 'ended'] as const satisfies readonly PeriodStatus[]

/** The roster's role order (B-12): coaches, then assistants, then participants. */
export const ROSTER_ROLE_ORDER: readonly MembershipRole[] = ['coach', 'assistant', 'participant']

/** A role's place in the roster order; an unknown role sorts last. */
export function rosterRoleRank(role: string): number {
  const rank = ROSTER_ROLE_ORDER.indexOf(role as MembershipRole)
  return rank < 0 ? ROSTER_ROLE_ORDER.length : rank
}

/**
 * The roster order of `sortField=roster` (REQ-A03): by role (coaches first), then the latest start first, then the id
 * for a stable page boundary. The server orders the same way in SQL; this is its reference. Returns a new array.
 */
export function rosterRoleOrder<T extends { id: string; role: string; validFrom: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      rosterRoleRank(a.role) - rosterRoleRank(b.role) ||
      b.validFrom.localeCompare(a.validFrom) ||
      a.id.localeCompare(b.id),
  )
}

/** The bounds of a roster view on `today`, as inclusive calendar-day comparisons on `valid_from` and `valid_to`. */
export type RosterViewBounds =
  | { view: 'active'; startsOnOrBefore: CalendarDate; endsOnOrAfter: CalendarDate }
  | { view: 'upcoming'; startsAfter: CalendarDate }
  | { view: 'ended'; endsBefore: CalendarDate }

/** The filter of a roster view (REQ-A03): the same split as `periodStatus`, expressed as bounds a query can use. */
export function rosterViewBounds(view: PeriodStatus, today: CalendarDate): RosterViewBounds {
  if (view === 'active') return { view, startsOnOrBefore: today, endsOnOrAfter: today }
  if (view === 'upcoming') return { view, startsAfter: today }
  return { view, endsBefore: today }
}

export const MEMBERSHIP_ACTIONS = ['edit', 'end', 'remove'] as const
export type MembershipAction = (typeof MEMBERSHIP_ACTIONS)[number]

/**
 * The row actions a manager is offered per membership status (REQ-A03, J-A01 step 3): an upcoming membership cannot be
 * ended (it is edited or removed), an ended one is not ended again. Remove is offered on every row; the server refuses
 * a started membership that was used (409 `membership_in_use`).
 */
export function membershipActions(status: PeriodStatus): MembershipAction[] {
  if (status === 'active') return ['edit', 'end', 'remove']
  return ['edit', 'remove']
}

/**
 * Whether an end with the last day `validTo` is refused with 422 `membership_not_started` (REQ-A03): the membership
 * starts after `today`, or the last day is before its first day.
 */
export function endRefused(period: { validFrom: CalendarDate }, validTo: CalendarDate, today: CalendarDate): boolean {
  return period.validFrom > today || validTo < period.validFrom
}

/**
 * Whether a membership may be removed (REQ-A03): one that has not started always; a started one only when `activities`
 * answered that it was never used. `used` is null when the usage contract is not registered.
 */
export function mayRemoveMembership(
  period: { validFrom: CalendarDate },
  today: CalendarDate,
  used: boolean | null,
): boolean {
  return period.validFrom > today || used === false
}

/**
 * The comparison key of a group name in the bulk import's group column (#65, club spec REQ-036, D-026): Unicode NFC,
 * trimmed, lower case. "Orliki U8", " orliki u8 " and "ORLIKI U8" are one name; inner spaces and punctuation count.
 */
export function groupNameKey(name: string): string {
  return name.normalize('NFC').trim().toLowerCase()
}

export type NamedGroup = { id: string; name: string }

/** The group a name of the import names: exactly one, none or more than one (never a guess). */
export type GroupNameMatch =
  { status: 'resolved'; groupId: string } | { status: 'group_not_found' } | { status: 'group_ambiguous' }

/**
 * Resolves each name against the club's groups (the caller passes the live, active groups of one club): one group
 * with the same `groupNameKey` → `resolved`; none, or a blank name → `group_not_found`; several (e.g. a name shared
 * by groups of two sections) → `group_ambiguous`. A group is never created from a name. Keyed by the names as given.
 */
export function matchGroupNames(names: readonly string[], groups: readonly NamedGroup[]): Map<string, GroupNameMatch> {
  const byKey = new Map<string, string[]>()
  for (const group of groups) {
    const key = groupNameKey(group.name)
    byKey.set(key, [...(byKey.get(key) ?? []), group.id])
  }
  const matches = new Map<string, GroupNameMatch>()
  for (const name of names) {
    const key = groupNameKey(name)
    const ids = key.length > 0 ? (byKey.get(key) ?? []) : []
    if (ids.length === 1) matches.set(name, { status: 'resolved', groupId: ids[0] })
    else matches.set(name, { status: ids.length === 0 ? 'group_not_found' : 'group_ambiguous' })
  }
  return matches
}
