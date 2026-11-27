// The pure part of `groups.applicationTargets` (sign-up form spec DD-J05, REQ-J01): one group of a section as the
// section's sign-up form and the coordinator's decisions see it — its age fit rule on the application's reference date,
// its limit of places and how many are taken on that date. The service (`services/application-targets.ts`) reads the
// rows; this file only shapes them. Time is a parameter; nothing here reads the database.
import { fitRuleOf, referenceYear, type AgeCategoryRange, type CalendarDate, type FitRule } from '@vereino/core'
import type { GroupKind } from './groups-rules'

/** One group of the section with what an application needs to know about it (DD-J05). */
export type ApplicationTarget = {
  groupId: string
  name: string
  kind: GroupKind
  /** The group's own season (a team); null for a class group or a team without one. */
  seasonId: string | null
  /** The last day of the club season that contains `date` (DD-J03, DD-J14); null when no season contains it. */
  seasonEndsOn: CalendarDate | null
  ageFrom: number | null
  ageTo: number | null
  /** The label of a team's age category (`dictionaries`); null without one. */
  ageCategoryLabel: string | null
  /** The age fit rule on `date` (`@vereino/core`, DD-J04); null when the group has neither a "U" range nor ages. */
  fitRule: FitRule | null
  /** The limit of participant places; null = no limit. */
  placesLimit: number | null
  /** Distinct persons with a participant membership active on `date`. */
  occupied: number
  acceptsApplications: boolean
  isPublic: boolean
  isActive: boolean
  /** The group's public conditions (what to bring, #801); null for a group that is not public or has none. */
  publicConditions: string | null
}

/** The stored group as the target reads it. */
export type ApplicationTargetGroup = {
  id: string
  name: string
  kind: GroupKind
  seasonId?: string | null
  ageFrom?: number | null
  ageTo?: number | null
  placesLimit?: number | null
  acceptsApplications: boolean
  isPublic: boolean
  isActive: boolean
  publicConditions?: string | null
}

/** What the service read for the group besides its row. */
export type ApplicationTargetFacts = {
  /** The application's reference date (or the start day on accept). */
  date: CalendarDate
  /** The club season that contains `date` (the latest start when several do); null without one. */
  referenceSeason: { startsOn: CalendarDate; endsOn: CalendarDate } | null
  /** The "U" range of a team's live age category; null for a class group or a category without a range. */
  categoryRange: AgeCategoryRange | null
  ageCategoryLabel: string | null
  occupied: number
}

/**
 * The target of one group (DD-J05): a team whose age category has a "U" range fits by birth year in the reference
 * year of the season that contains `date` (or `date`'s year without one, DD-J03); any other group by its age range.
 */
export function applicationTarget(group: ApplicationTargetGroup, facts: ApplicationTargetFacts): ApplicationTarget {
  const ages = { ageFrom: group.ageFrom ?? null, ageTo: group.ageTo ?? null }
  const year = referenceYear(facts.referenceSeason?.startsOn ?? null, facts.date)
  return {
    groupId: group.id,
    name: group.name,
    kind: group.kind,
    seasonId: group.seasonId ?? null,
    seasonEndsOn: facts.referenceSeason?.endsOn ?? null,
    ...ages,
    ageCategoryLabel: facts.ageCategoryLabel,
    fitRule: fitRuleOf(group.kind === 'team' ? facts.categoryRange : null, year, ages),
    placesLimit: group.placesLimit ?? null,
    occupied: facts.occupied,
    acceptsApplications: group.acceptsApplications,
    isPublic: group.isPublic,
    isActive: group.isActive,
    publicConditions: group.isPublic ? group.publicConditions?.trim() || null : null,
  }
}
