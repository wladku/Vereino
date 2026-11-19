// The season contributor contract (people life-cycle spec REQ-L08, DD-L10, *API* row `SeasonContributor`; phase L9,
// #311). `groups` previews and applies a season rollover; `activities` and `payments` register an optional contributor
// under `groups.season.<module>`, which `groups` reads with `hasRegistration` — the direction of the departure
// contributors (`people/services/departure.ts`), so `groups` never imports those modules. Contributors read and write
// with the caller's EntityManager, so a rollover is one transaction: a contributor that throws rolls the whole
// rollover back. Their events run after the commit through `afterCommit`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { groupsErrors } from '../api/errors'
import {
  copyEndsOn,
  recordActionFor,
  runsPast,
  type RolloverGroupAction,
  type RolloverRecordAction,
} from '../lib/season-rollover'

/** The modules that may contribute, in the order they are applied (a fee copy needs the activity copies' ids). */
export const SEASON_CONTRIBUTOR_MODULES = ['activities', 'payments'] as const
export type SeasonContributorModule = (typeof SEASON_CONTRIBUTOR_MODULES)[number]

/** DI token of a module's contributor, e.g. `groups.season.activities`. */
export function seasonContributorToken(module: SeasonContributorModule): string {
  return `groups.season.${module}`
}

export type RolloverSeason = { id: string; name: string; startsOn: string; endsOn: string }

/** One group of the old season inside the actor's scope, with what the plan does to it (`none`: left alone). */
export type RolloverPlanGroup = {
  groupId: string
  sectionId: string
  name: string
  action: Exclude<RolloverGroupAction, 'copy'> | 'none'
}

/** A record action as sent: the action and, for `end_and_copy`, the values the copy changes. */
export type RolloverRecordChoice = {
  action: RolloverRecordAction
  copy?: Record<string, string | number | null>
}

/** The resolved plan the contributors read; scope and dates are trusted (never from the payload as such). */
export type SeasonRolloverPlan = {
  tenantId: string
  organizationId: string
  fromSeason: RolloverSeason
  /** The new season; its id is fixed before the apply also when the plan creates it. */
  toSeason: RolloverSeason & { created: boolean }
  /** The old season's last day: what ends, ends on it. */
  lastDay: string
  /** The club's today. */
  today: string
  groups: RolloverPlanGroup[]
  /** The record choices by record id (activities and fees of continued or renamed groups). */
  records: Record<string, RolloverRecordChoice>
}

/** A recurring activity or fee the wizard offers for a group (step 3). `version` makes a changed record stale. */
export type SeasonCandidate = {
  module: SeasonContributorModule
  kind: string
  recordId: string
  groupId: string
  version: string
  label: Record<string, string | number | null>
}

/** What the rollover does to one record: `create` a copy, `end` it on the last day. */
export type SeasonPreviewItem = {
  module: string
  kind: string
  recordId: string | null
  groupId: string
  action: 'create' | 'update' | 'end' | 'remove'
  label: Record<string, string | number | null>
}

/** A copy that collides (an activity copy with a rental, a place over capacity or a busy coach). */
export type SeasonConflict = {
  module: string
  kind: string
  recordId: string
  groupId: string
  label: Record<string, string | number | null>
  conflicts: unknown[]
}

/** Something the user should know that does not stop the plan (e.g. fees only the club administrator changes). */
export type SeasonNotice = { module: string; code: string; groupId?: string; params?: Record<string, string | number> }

export type SeasonPreviewPart = {
  candidates: SeasonCandidate[]
  items: SeasonPreviewItem[]
  conflicts: SeasonConflict[]
  notices: SeasonNotice[]
}

/** What a contributor changed, for its own `afterCommit` (events, cache, search). */
export type SeasonChange = {
  kind: string
  recordId: string
  action: 'created' | 'updated' | 'deleted'
  /** Ids of dependent records the change touched (e.g. an activity's sessions), for the module's own events. */
  related?: Record<string, string[]>
}

export type SeasonApplyResult = {
  changes: SeasonChange[]
  /** Old record id → id of its copy, so a later contributor can point at the copy (a fee of a copied activity). */
  copies: Record<string, string>
}

/**
 * The rules a contributor applies, handed over in the context: a module may import only the types of another
 * module (the module boundaries), so `groups` passes its rules as values (one source: `lib/season-rollover.ts`).
 */
export type SeasonRolloverRules = {
  /** What the plan does to a record of a group: `end`, `end_and_copy`, `keep`, or null (group left alone). */
  recordAction(plan: SeasonRolloverPlan, groupId: string, recordId: string): RolloverRecordAction | null
  /** A period still running after the last day. */
  runsPast(period: { validTo: string | null }, lastDay: string): boolean
  /** The last day of a copy: open-ended when the original was, else the new season's last day. */
  copyEndsOn(originalEnd: string | null, newSeasonEndsOn: string): string | null
  /** Throws 422 `rollover_copy_invalid` naming the field. */
  copyInvalid(field: string): Promise<never>
}

/** The command context of the actor (their grants decide what a contributor may change), the container, the rules. */
export type SeasonRolloverContext = {
  container: AwilixContainer
  command: CommandRuntimeContext
  rules: SeasonRolloverRules
}

export type SeasonContributor = {
  /** The candidates of the plan's groups, what the plan would create and end, and the copies' conflicts. Read only. */
  preview(em: EntityManager, plan: SeasonRolloverPlan, ctx: SeasonRolloverContext): Promise<SeasonPreviewPart>
  /** Applies the plan in the caller's transaction; throws to roll the whole rollover back. */
  apply(
    em: EntityManager,
    plan: SeasonRolloverPlan,
    ctx: SeasonRolloverContext,
    copies: Readonly<Record<string, string>>,
  ): Promise<SeasonApplyResult>
  /** After the commit: the module's events. A failure is logged, never rolled back. */
  afterCommit(
    changes: readonly SeasonChange[],
    ctx: { container: AwilixContainer; tenantId: string; organizationId: string },
  ): Promise<void>
  /** The first planned session of each group from `from` on (ISO instants), for the announcement. */
  firstSessions?(
    em: EntityManager,
    scope: { tenantId: string; organizationId: string },
    groupIds: readonly string[],
    from: string,
  ): Promise<Record<string, string>>
}

/** The registered contributors in `SEASON_CONTRIBUTOR_MODULES` order; an absent module contributes nothing. */
export function seasonContributors(
  container: AwilixContainer,
): Array<{ module: SeasonContributorModule; contributor: SeasonContributor }> {
  return SEASON_CONTRIBUTOR_MODULES.filter((module) => container.hasRegistration(seasonContributorToken(module))).map(
    (module) => ({ module, contributor: container.resolve<SeasonContributor>(seasonContributorToken(module)) }),
  )
}

/** The rules `groups` hands to the contributors. */
export const seasonRolloverRules: SeasonRolloverRules = {
  recordAction(plan, groupId, recordId) {
    const group = plan.groups.find((entry) => entry.groupId === groupId)
    return recordActionFor(group?.action, plan.records[recordId]?.action)
  },
  runsPast,
  copyEndsOn,
  copyInvalid: (field) => groupsErrors.throw('rollover_copy_invalid', { field }),
}
