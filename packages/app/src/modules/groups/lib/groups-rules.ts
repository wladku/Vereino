// Pure rules of the `groups` module (club spec glossary *Group*, *Membership*, *Coach / instructor*; DD-03a): the
// group kinds and membership roles, the team-only fields, membership periods and the season dates. Time is a
// parameter (engineering standards S3.5); nothing here reads the database.
import {
  addCalendarDays,
  ageOn,
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

/**
 * The PZPN "U" range of an age category (people life-cycle spec REQ-L16, DD-L17; #384): a child belongs to
 * "U{from}–U{to}" in a reference year R when `R − birth year + 1` lies in the range. `uTo` null is open (Senior).
 */
export type AgeCategoryRange = { readonly uFrom: number; readonly uTo: number | null }

/** The bounds of a "U" year, as typed by the club administrator. */
export const AGE_U_MIN = 1
export const AGE_U_MAX = 99

export type AgeCategorySeed = { readonly value: string; readonly label: string; readonly range: AgeCategoryRange }

/**
 * The PZPN (Polish Football Association) age categories the club's age category dictionary starts with (club spec
 * REQ-019, #92), youngest first, preceded by the academy's youngest group "Kids" (ages 4–5, the mockup's `g-kids`;
 * people life-cycle spec phase L3, approved on #255). Labels are the names with their age groups; the club
 * administrator edits them. Seeded only for a new club: an existing club adds "Kids" in place from the group form.
 * Each carries its "U" range (REQ-L16, #384); migration E gives existing clubs the same ranges for the entries that
 * still carry these values.
 */
export const PZPN_AGE_CATEGORIES: readonly AgeCategorySeed[] = [
  { value: 'kids', label: 'Kids (U4–U5)', range: { uFrom: 4, uTo: 5 } },
  { value: 'skrzat', label: 'Skrzat (U6–U7)', range: { uFrom: 6, uTo: 7 } },
  { value: 'zak', label: 'Żak (U8–U9)', range: { uFrom: 8, uTo: 9 } },
  { value: 'orlik', label: 'Orlik (U10–U11)', range: { uFrom: 10, uTo: 11 } },
  { value: 'mlodzik', label: 'Młodzik (U12–U13)', range: { uFrom: 12, uTo: 13 } },
  { value: 'trampkarz', label: 'Trampkarz (U14–U15)', range: { uFrom: 14, uTo: 15 } },
  { value: 'junior_mlodszy', label: 'Junior młodszy (U16–U17)', range: { uFrom: 16, uTo: 17 } },
  { value: 'junior_starszy', label: 'Junior starszy (U18–U19)', range: { uFrom: 18, uTo: 19 } },
  { value: 'senior', label: 'Senior', range: { uFrom: 20, uTo: null } },
]

/** A "U" year as typed in a form: blank → null (open), a whole number 1…99 → the number, anything else → `invalid`. */
export function parseUInput(value: string): number | null | 'invalid' {
  const text = value.trim()
  if (text === '') return null
  if (!/^\d{1,2}$/.test(text)) return 'invalid'
  const year = Number(text)
  return year >= AGE_U_MIN ? year : 'invalid'
}

/** True when both "U" bounds are set and "U od" is above "U do" (422 `age_range_inverted`). */
export function ageCategoryRangeInverted(range: AgeCategoryRange): boolean {
  return range.uTo !== null && range.uFrom > range.uTo
}

/**
 * The reference year of the birth-year rule (Q-L25, confirmed 2026-11-19): the calendar year in which the season
 * starts (2026/27 → 2026); without a season, the year of `fallbackDate` (the move date or today).
 */
export function referenceYear(seasonStartsOn: CalendarDate | null, fallbackDate: CalendarDate): number {
  return Number((seasonStartsOn ?? fallbackDate).slice(0, 4))
}

/** The birth years of a range in reference year R: `R − u_to + 1` … `R − u_from + 1`; `from` null when open. */
export type BirthYears = { readonly from: number | null; readonly to: number }

export function birthYearsOf(range: AgeCategoryRange, year: number): BirthYears {
  return { from: range.uTo === null ? null : year - range.uTo + 1, to: year - range.uFrom + 1 }
}

/** Whether a child born in `birthYear` belongs to the range in reference year R (DD-L17: by birth year, not by day). */
export function fitsAgeCategory(birthYear: number, range: AgeCategoryRange, year: number): boolean {
  const u = year - birthYear + 1
  return u >= range.uFrom && (range.uTo === null || u <= range.uTo)
}

/**
 * The public age range a team is proposed from its category (Q-L26, confirmed 2026-11-19): "Wiek od" = u_from − 1,
 * "Wiek do" = u_to (open stays open), kept within the publishable ages `GROUP_AGE_MIN`…`GROUP_AGE_MAX`.
 */
export function proposedAgeRange(range: AgeCategoryRange): { ageFrom: number; ageTo: number | null } {
  const clamp = (age: number) => Math.min(GROUP_AGE_MAX, Math.max(GROUP_AGE_MIN, age))
  return { ageFrom: clamp(range.uFrom - 1), ageTo: range.uTo === null ? null : clamp(range.uTo) }
}

/**
 * Whether the public age form proposes the category's range: the category has one and both age fields are still
 * empty — a value already set is never overwritten.
 */
export function shouldProposeAgeRange(
  range: AgeCategoryRange | null,
  ageFrom: number | null,
  ageTo: number | null,
): range is AgeCategoryRange {
  return range !== null && ageFrom === null && ageTo === null
}

/** The birth years as text: "2016–2017", one year "2017", open "≤ 2006". */
export function formatBirthYears(years: BirthYears): string {
  if (years.from === null) return `≤ ${String(years.to)}`
  return years.from === years.to ? String(years.to) : `${String(years.from)}–${String(years.to)}`
}

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
 * `case <alias>.role when 'coach' then 0 … else 3 end`: `rosterRoleRank` as the SQL sort key of `sortField=roster`
 * (`services/roster-list.ts`), built from the same `ROSTER_ROLE_ORDER`, so the server and `rosterRoleOrder` agree.
 */
export function rosterRoleRankSql(alias: string): string {
  const cases = ROSTER_ROLE_ORDER.map((role) => `when '${role}' then ${String(rosterRoleRank(role))}`).join(' ')
  return `case ${alias}.role ${cases} else ${String(ROSTER_ROLE_ORDER.length)} end`
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

export type MovePlan =
  | { ok: true; lastDay: CalendarDate; next: { validFrom: CalendarDate; validTo: CalendarDate | null } }
  | { ok: false; problem: 'same_group' | 'not_started' | 'not_active_on_date' }

/**
 * A group move (people life-cycle spec *Domain Vocabulary* → Group move, REQ-L11, DD-L15; #312): the membership ends
 * the day before `date` (REQ-A03's end on a chosen last day, so it must have started and `date` must lie after its
 * first day) and a membership of the same role starts in the target group on `date`, keeping a planned last day. A
 * membership already over before `date` has nothing to move; the target must be another group.
 */
export function planMove(
  membership: { groupId: string; validFrom: CalendarDate; validTo: CalendarDate | null },
  move: { toGroupId: string; date: CalendarDate },
  today: CalendarDate,
): MovePlan {
  if (move.toGroupId === membership.groupId) return { ok: false, problem: 'same_group' }
  const lastDay = addCalendarDays(move.date, -1)
  if (endRefused(membership, lastDay, today)) return { ok: false, problem: 'not_started' }
  if (membership.validTo !== null && membership.validTo < move.date) return { ok: false, problem: 'not_active_on_date' }
  return { ok: true, lastDay, next: { validFrom: move.date, validTo: membership.validTo } }
}

/**
 * The first-day field of the roster's Move dialog (spec L *Roster: moving children*): never in the past and after the
 * membership's first day; the 1st of the next month by default, or the earliest allowed day when that is later.
 */
export function moveDateBounds(
  today: CalendarDate,
  validFrom: CalendarDate | null,
): { min: CalendarDate; initial: CalendarDate } {
  const afterStart = validFrom ? addCalendarDays(validFrom, 1) : today
  const min = afterStart > today ? afterStart : today
  const [year, month] = today.split('-').map(Number)
  const next = month === 12 ? `${String(year + 1)}-01-01` : `${String(year)}-${String(month + 1).padStart(2, '0')}-01`
  return { min, initial: next > min ? next : min }
}

/** The most children one bulk move takes (people life-cycle spec Q-L22: one roster, one target group, up to 100). */
export const MOVE_MANY_LIMIT = 100

export type MoveManyProblem = 'too_many' | 'same_group' | 'date_in_past'

/**
 * Why a bulk move (`groups.memberships.move_many`, REQ-L15, DD-L16) is refused before any child is looked at, or null:
 * more than `MOVE_MANY_LIMIT` children (422 `move_too_many`), the same group (422 `move_same_group`), a first day before
 * `today` in the club zone (422 `move_date_in_past`, Q-L08).
 */
export function moveManyProblem(
  move: { fromGroupId: string; toGroupId: string; date: CalendarDate; count: number },
  today: CalendarDate,
): MoveManyProblem | null {
  if (move.count > MOVE_MANY_LIMIT) return 'too_many'
  if (move.fromGroupId === move.toGroupId) return 'same_group'
  if (move.date < today) return 'date_in_past'
  return null
}

export const MOVE_OUTCOMES = ['move', 'skip_already_member', 'skip_not_active'] as const
export type MoveOutcome = (typeof MOVE_OUTCOMES)[number]

/**
 * What a bulk move does with one child (REQ-L15, Q-L24): a membership the single move cannot move on `date` (not
 * started by then, or over before it) is `skip_not_active`; a child whose participant membership of the target group
 * overlaps the new period is `skip_already_member` (the others still move); every other child is moved.
 */
export function moveOutcome(plan: MovePlan, alreadyMember: boolean): MoveOutcome {
  if (!plan.ok) return 'skip_not_active'
  return alreadyMember ? 'skip_already_member' : 'move'
}

/**
 * The age-fit rule of the roster's **Fits {group}** filter (REQ-L15): a child fits the target group when their age in
 * completed years on the move date lies within the group's `age_from`–`age_to` (either bound may be open). Null when
 * it cannot be told: the group has no age range, or the child has no birth date.
 */
export function fitsAgeRange(
  birthDate: CalendarDate | null,
  date: CalendarDate,
  range: { ageFrom: number | null; ageTo: number | null },
): boolean | null {
  if (range.ageFrom === null && range.ageTo === null) return null
  if (!birthDate) return null
  const age = ageOn(birthDate, date)
  return (range.ageFrom === null || age >= range.ageFrom) && (range.ageTo === null || age <= range.ageTo)
}

/**
 * The rule the roster's **Fits {group}** filter applies (REQ-L15 with REQ-L16, DD-L17, AC-L16): a team whose age
 * category has a "U" range fits by birth year in the reference year R (`birth_years`, with the birth years shown on
 * the chip); any other group fits by age on the move date within its `age_from`–`age_to` (`age`). Null when the group
 * has neither.
 */
export type FitRule =
  | {
      kind: 'birth_years'
      uFrom: number
      uTo: number | null
      referenceYear: number
      from: number | null
      to: number
    }
  | { kind: 'age'; ageFrom: number | null; ageTo: number | null }

export function fitRuleOf(
  category: AgeCategoryRange | null,
  year: number,
  ages: { ageFrom: number | null; ageTo: number | null },
): FitRule | null {
  if (category) {
    const { uFrom, uTo } = category
    return { kind: 'birth_years', uFrom, uTo, referenceYear: year, ...birthYearsOf(category, year) }
  }
  if (ages.ageFrom === null && ages.ageTo === null) return null
  return { kind: 'age', ageFrom: ages.ageFrom, ageTo: ages.ageTo }
}

/** Whether a child fits the target by `rule` on the move date; null without a rule or a birth date. */
export function fitsRule(birthDate: CalendarDate | null, date: CalendarDate, rule: FitRule | null): boolean | null {
  if (!rule || !birthDate) return null
  if (rule.kind === 'age') return fitsAgeRange(birthDate, date, rule)
  return fitsAgeCategory(Number(birthDate.slice(0, 4)), rule, rule.referenceYear)
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
