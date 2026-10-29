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

/** The fields only a `team` may carry (`age_category_entry_id` joins them with the `dictionaries` module). */
export const TEAM_FIELDS = ['league', 'seasonId'] as const
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
