// The season rollover (people life-cycle spec REQ-L08, DD-L10, *API* rows `/api/groups/seasons/rollover[/preview]`,
// J-L06; phase L9, #311). The club administrator moves the club, a coordinator their sections, to a new season in one
// previewed step: per group of the old season `continue` (the group's season becomes the new one), `rename` (continue
// with a new name and age category), `close` (deactivated; its memberships, recurring activities and fees end on the
// old season's last day) or `copy` (a new group with the same settings and an empty roster); per recurring activity
// and fee of a continued or renamed group `end`, `end_and_copy` (with new values) or `keep`. The activities and fees
// belong to the contributors `groups.season.activities|payments` (`services/season-rollover.ts`).
//
// `previewRollover` lists the groups in the actor's scope, the contributors' candidates and what the plan creates,
// changes and ends, with the conflicts of the copies, and issues a token that binds the plan and what it showed.
// `groups.seasons.rollover` rebuilds the same preview in its transaction under the groups' row locks and applies it
// only when the token still matches (409 `rollover_plan_stale` otherwise — a group changed in between, or the same
// plan applied a second time, whose groups have already moved) and nothing collides (409 `rollover_conflicts`); a
// failure anywhere rolls everything back. Not undoable: each created record is ended or deleted by its own command.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { findActingRole, type ActingRole, type Scope } from '@vereino/core'
import { assertInScope, authorizeScoped } from '@/modules/foundation'
import { groupsErrors } from '../api/errors'
import { Group, GroupMembership, Season } from '../data/entities'
import { rolloverApplySchema, rolloverPreviewSchema, type RolloverPreviewInput } from '../data/validators'
import { seasonDatesInverted } from '../lib/groups-rules'
import { checkRolloverToken, issueRolloverToken } from '../lib/rollover-token'
import {
  closedGroupIds,
  continuedGroupIds,
  membershipOutcome,
  rolloverPlanProblem,
  type RolloverGroupRow,
} from '../lib/season-rollover'
import { isAgeCategoryEntry } from '../services/age-categories'
import { clubToday } from '../services/club-clock'
import {
  seasonContributors,
  seasonRolloverRules,
  type RolloverPlanGroup,
  type SeasonCandidate,
  type SeasonChange,
  type SeasonConflict,
  type SeasonContributorModule,
  type SeasonNotice,
  type SeasonPreviewItem,
  type SeasonRolloverPlan,
} from '../services/season-rollover'
import { emitGroupsEvent } from '../events'
import { groupEvents } from './groups'
import { seasonEvents } from './seasons'
import {
  DICTIONARY_WRITE_KINDS,
  DICTIONARY_WRITE_OPTIONS,
  GROUP_WRITE_KINDS,
  dictionaryTarget,
  emitGroupsSideEffects,
  groupTarget,
  inWriteTransaction,
  isUniqueViolation,
  membershipEvents,
  type GroupsScope,
} from './shared'

const logger = createLogger('groups').child({ component: 'season-rollover' })

export const ROLLOVER_RESOURCE_KIND = 'groups.season'

/** A group of the old season as the wizard lists it (step 2). */
export type RolloverGroupView = {
  groupId: string
  sectionId: string
  name: string
  ageCategoryEntryId: string | null
  participants: number
  updatedAt: string
}

export type RolloverPreview = {
  fromSeason: { id: string; name: string; startsOn: string; endsOn: string }
  toSeason: { id: string | null; name: string; startsOn: string; endsOn: string; created: boolean }
  lastDay: string
  groups: RolloverGroupView[]
  candidates: SeasonCandidate[]
  items: SeasonPreviewItem[]
  conflicts: SeasonConflict[]
  notices: SeasonNotice[]
}

/** Everything the preview and the apply share: the view and the rows the apply writes. */
type RolloverBuild = {
  view: RolloverPreview
  plan: SeasonRolloverPlan
  groupRows: Map<string, Group>
  memberships: GroupMembership[]
  binding: unknown
}

type ParsedPlan = RolloverPreviewInput

/** The plan as the token binds it: what the user sent, without the token and the announcement switch. */
function planOf(parsed: ParsedPlan): unknown {
  return { fromSeasonId: parsed.fromSeasonId, season: parsed.season, groups: parsed.groups, records: parsed.records }
}

async function loadSeason(em: EntityManager, scope: GroupsScope, id: string, lock = false): Promise<Season | null> {
  return em.findOne(
    Season,
    { id, ...scope, deletedAt: null },
    lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : undefined,
  )
}

/** The authorization of the rollover itself: a club-wide season write (the club administrator, any coordinator). */
function rolloverSpec<TSchema extends typeof rolloverPreviewSchema | typeof rolloverApplySchema>(input: TSchema) {
  return {
    input,
    resourceKind: ROLLOVER_RESOURCE_KIND,
    allowedKinds: DICTIONARY_WRITE_KINDS,
    matchOptions: DICTIONARY_WRITE_OPTIONS,
    lock: 'none' as const,
    resolveTarget: (parsed: ParsedPlan, _entity: unknown, scope: GroupsScope) =>
      dictionaryTarget({ id: parsed.fromSeasonId, ...scope }),
  }
}

async function participantCounts(em: EntityManager, scope: GroupsScope, groupIds: string[], today: string) {
  const counts = new Map<string, number>()
  if (groupIds.length === 0) return counts
  const rows = await em.find(
    GroupMembership,
    {
      ...scope,
      groupId: { $in: groupIds },
      role: 'participant',
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['id', 'groupId'] },
  )
  for (const row of rows) counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1)
  return counts
}

/**
 * Builds the preview of `parsed` for the actor whose grants are `grants`, reading with `em` (the command's transaction
 * when it applies). `toSeasonId` is the id of the new season when the plan creates it (fixed before the apply).
 */
async function buildRollover(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  scope: GroupsScope,
  grants: Scope,
  parsed: ParsedPlan,
  input: { today: string; forApply: boolean; createdSeasonId: string | null },
): Promise<RolloverBuild> {
  const fromSeason = await loadSeason(em, scope, parsed.fromSeasonId)
  if (!fromSeason) return throwNotFound()
  let toSeason: RolloverPreview['toSeason']
  if ('id' in parsed.season) {
    const existing = await loadSeason(em, scope, parsed.season.id, input.forApply)
    if (!existing) return groupsErrors.throw('groups_reference_invalid', { field: 'season.id' })
    toSeason = { ...pickSeason(existing), created: false }
  } else {
    if (seasonDatesInverted(parsed.season.startsOn, parsed.season.endsOn)) {
      return groupsErrors.throw('season_dates_inverted', { field: 'season.endsOn' })
    }
    const taken = await em.findOne(Season, { ...scope, name: parsed.season.name, deletedAt: null }, { fields: ['id'] })
    // At the apply the preview has passed this check: a season with the name since then (another rollover, or this
    // plan applied before) means the plan is stale.
    if (taken) {
      return input.forApply
        ? groupsErrors.throw('rollover_plan_stale')
        : groupsErrors.throw('season_name_taken', { field: 'season.name' })
    }
    toSeason = { id: input.createdSeasonId, ...parsed.season, created: true }
  }
  const lastDay = fromSeason.endsOn

  // Every live, active group of the old season (any section) — the plan may name only these; the actor sees and
  // changes the ones in their scope (a coordinator: the groups of their sections; another section's group is 403).
  const seasonGroups = await em.find(
    Group,
    { ...scope, seasonId: fromSeason.id, isActive: true, deletedAt: null },
    {
      orderBy: { name: 'asc', id: 'asc' },
      ...(input.forApply ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {}),
    },
  )
  const groupRows = new Map(seasonGroups.map((group) => [group.id, group]))
  const inScope = seasonGroups.filter((group) => findActingRole(grants, GROUP_WRITE_KINDS, groupTarget(group)) !== null)
  for (const row of parsed.groups) {
    const group = groupRows.get(row.groupId)
    if (group) await assertInScope(grants, GROUP_WRITE_KINDS, groupTarget(group))
  }
  for (const row of parsed.groups) {
    if (row.ageCategoryEntryId && !(await isAgeCategoryEntry(em, scope, row.ageCategoryEntryId))) {
      await groupsErrors.throw('groups_reference_invalid', { field: 'ageCategoryEntryId' })
    }
  }

  const groupRowsPlan = parsed.groups as RolloverGroupRow[]
  const moving = new Map(groupRowsPlan.filter((row) => row.action !== 'copy').map((row) => [row.groupId, row.action]))
  const planGroups: RolloverPlanGroup[] = inScope.map((group) => ({
    groupId: group.id,
    sectionId: group.sectionId,
    name: group.name,
    action: (moving.get(group.id) ?? 'none') as RolloverPlanGroup['action'],
  }))
  const plan: SeasonRolloverPlan = {
    ...scope,
    fromSeason: pickSeason(fromSeason),
    toSeason: { ...toSeason, id: toSeason.id ?? '' },
    lastDay,
    today: input.today,
    groups: planGroups,
    records: Object.fromEntries(
      parsed.records.map((row) => [row.recordId, { action: row.action, ...(row.copy ? { copy: row.copy } : {}) }]),
    ),
  }

  const candidates: SeasonCandidate[] = []
  const items: SeasonPreviewItem[] = []
  const conflicts: SeasonConflict[] = []
  const notices: SeasonNotice[] = []
  // One contributor at a time: `em` may be the command's transaction, a single connection.
  for (const { contributor } of seasonContributors(ctx.container)) {
    const part = await contributor.preview(em, plan, {
      container: ctx.container,
      command: ctx,
      rules: seasonRolloverRules,
    })
    candidates.push(...part.candidates)
    items.push(...part.items)
    conflicts.push(...part.conflicts)
    notices.push(...part.notices)
  }

  const problem = rolloverPlanProblem({
    from: { id: fromSeason.id, startsOn: fromSeason.startsOn, endsOn: fromSeason.endsOn },
    to: { id: toSeason.created ? null : toSeason.id, startsOn: toSeason.startsOn, endsOn: toSeason.endsOn },
    groups: groupRowsPlan,
    records: parsed.records,
    seasonGroupIds: new Set(groupRows.keys()),
    recordGroups: new Map(candidates.map((candidate) => [candidate.recordId, candidate.groupId])),
    forApply: input.forApply,
  })
  if (problem) return groupsErrors.throw(problem.code, { field: problem.field })

  // `groups`'s own part: the season, the groups and the memberships of the closed groups.
  const closed = closedGroupIds(groupRowsPlan)
  const memberships =
    closed.size > 0
      ? (
          await em.find(
            GroupMembership,
            { ...scope, groupId: { $in: [...closed] }, deletedAt: null },
            { orderBy: { id: 'asc' } },
          )
        ).filter(
          (row) => membershipOutcome({ validFrom: row.validFrom, validTo: row.validTo ?? null }, lastDay) !== 'none',
        )
      : []
  const own: SeasonPreviewItem[] = []
  if (toSeason.created) {
    own.push({
      module: 'groups',
      kind: 'season',
      recordId: null,
      groupId: '',
      action: 'create',
      label: { name: toSeason.name, startsOn: toSeason.startsOn, endsOn: toSeason.endsOn },
    })
  }
  for (const row of groupRowsPlan) {
    const group = groupRows.get(row.groupId) as Group
    if (row.action === 'copy') {
      own.push({
        module: 'groups',
        kind: 'group',
        recordId: null,
        groupId: group.id,
        action: 'create',
        label: { name: row.name?.trim() ?? group.name, sourceName: group.name },
      })
      continue
    }
    own.push({
      module: 'groups',
      kind: 'group',
      recordId: group.id,
      groupId: group.id,
      action: row.action === 'close' ? 'end' : 'update',
      label: {
        name: group.name,
        change: row.action,
        ...(row.action === 'rename' ? { newName: row.name?.trim() ?? group.name } : {}),
      },
    })
    if (row.action === 'close') {
      const ofGroup = memberships.filter((membership) => membership.groupId === group.id)
      const removed = ofGroup.filter(
        (membership) =>
          membershipOutcome({ validFrom: membership.validFrom, validTo: membership.validTo ?? null }, lastDay) ===
          'remove',
      ).length
      if (ofGroup.length > 0) {
        own.push({
          module: 'groups',
          kind: 'memberships',
          recordId: group.id,
          groupId: group.id,
          action: 'end',
          label: { name: group.name, count: ofGroup.length - removed, removed, until: lastDay },
        })
      }
    }
  }

  const counts = await participantCounts(
    em,
    scope,
    inScope.map((group) => group.id),
    input.today,
  )
  const view: RolloverPreview = {
    fromSeason: pickSeason(fromSeason),
    toSeason,
    lastDay,
    groups: inScope.map((group) => ({
      groupId: group.id,
      sectionId: group.sectionId,
      name: group.name,
      ageCategoryEntryId: group.ageCategoryEntryId ?? null,
      participants: counts.get(group.id) ?? 0,
      updatedAt: group.updatedAt.toISOString(),
    })),
    candidates,
    items: [...own, ...items],
    conflicts,
    notices,
  }
  // The token binds what the preview showed: the groups and records with their versions, every planned change, the
  // memberships a close ends and the conflicts. A change to any of them makes the plan stale.
  const binding = {
    toSeason: { name: toSeason.name, startsOn: toSeason.startsOn, endsOn: toSeason.endsOn, created: toSeason.created },
    groups: view.groups.map((group) => [group.groupId, group.updatedAt]),
    candidates: candidates.map((candidate) => [candidate.recordId, candidate.version]),
    items: view.items.map((item) => [item.module, item.kind, item.recordId, item.groupId, item.action]),
    memberships: memberships.map((row) => [row.id, row.validTo ?? null]),
    conflicts: conflicts.map((conflict) => conflict.recordId),
  }
  return { view, plan, groupRows, memberships, binding }
}

/** An old season outside the club (another organization's, or deleted): 404, as for any record of another club. */
async function throwNotFound(): Promise<never> {
  const { translate } = await resolveTranslations()
  throw notFound(translate('foundation.errors.not_found', 'Not found'))
}

function pickSeason(row: Season) {
  return { id: row.id, name: row.name, startsOn: row.startsOn, endsOn: row.endsOn }
}

/**
 * The preview (`POST /api/groups/seasons/rollover/preview`): authorized like the rollover, read in a transaction that
 * writes nothing; the token binds the scope, the actor, the plan and what it showed (*Security*, 15 minutes).
 */
export async function previewRollover(
  ctx: CommandRuntimeContext,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<{ preview: RolloverPreview; previewToken: string }> {
  return inWriteTransaction(ctx, 'groups.seasons.rollover.preview', async (em) => {
    const authorized = await authorizeScoped(rolloverSpec(rolloverPreviewSchema), rawInput, ctx, em)
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const today = await clubToday(ctx.container, scope, now)
    const built = await buildRollover(em, ctx, scope, authorized.scope, authorized.parsed, {
      today,
      forApply: false,
      createdSeasonId: null,
    })
    const previewToken = issueRolloverToken(
      { ...scope, actorUserId: ctx.auth?.sub ?? '', plan: planOf(authorized.parsed), content: built.binding },
      now.getTime(),
    )
    return { preview: built.view, previewToken }
  })
}

export type RolloverSummary = {
  seasonId: string
  seasonCreated: boolean
  groups: { continued: number; renamed: number; closed: number; copied: number }
  membershipsEnded: number
  modules: Partial<Record<SeasonContributorModule, number>>
  announced: number
}

export type RolloverCommandResult = {
  tenantId: string
  organizationId: string
  actingRole: ActingRole
  fromSeasonId: string
  summary: RolloverSummary
}

type Written = {
  season: Season | null
  createdGroups: Group[]
  updatedGroups: Group[]
  endedMemberships: GroupMembership[]
  removedMemberships: GroupMembership[]
  changes: Partial<Record<SeasonContributorModule, SeasonChange[]>>
  /** The continued and renamed groups, for the announcement. */
  continuedGroupIds: string[]
}

/** Applies `groups`'s part of the plan; returns what it wrote. */
function applyGroups(
  em: EntityManager,
  built: RolloverBuild,
  rows: readonly RolloverGroupRow[],
  ageCategories: ReadonlyMap<number, string | null | undefined>,
  written: Written,
): void {
  const { plan, groupRows } = built
  const now = new Date()
  for (const [index, row] of rows.entries()) {
    const group = groupRows.get(row.groupId) as Group
    if (row.action === 'copy') {
      const copy = em.create(Group, {
        id: randomUUID(),
        tenantId: group.tenantId,
        organizationId: group.organizationId,
        sectionId: group.sectionId,
        name: (row.name as string).trim(),
        kind: group.kind,
        ageCategoryEntryId: ageCategories.has(index) ? ageCategories.get(index) : group.ageCategoryEntryId,
        league: group.league ?? null,
        seasonId: plan.toSeason.id,
        description: group.description ?? null,
        isActive: true,
        isPublic: group.isPublic,
        publicDescription: group.publicDescription ?? null,
        publicConditions: group.publicConditions ?? null,
        ageFrom: group.ageFrom ?? null,
        ageTo: group.ageTo ?? null,
        levelLabel: group.levelLabel ?? null,
        placesLimit: group.placesLimit ?? null,
        acceptsApplications: group.acceptsApplications,
      })
      em.persist(copy)
      written.createdGroups.push(copy)
      continue
    }
    if (row.action === 'close') {
      group.isActive = false
    } else {
      group.seasonId = plan.toSeason.id
      if (row.action === 'rename') {
        group.name = (row.name as string).trim()
        if (ageCategories.has(index)) group.ageCategoryEntryId = ageCategories.get(index)
      }
      written.continuedGroupIds.push(group.id)
    }
    group.updatedAt = now
    written.updatedGroups.push(group)
  }
  for (const membership of built.memberships) {
    const outcome = membershipOutcome(
      { validFrom: membership.validFrom, validTo: membership.validTo ?? null },
      plan.lastDay,
    )
    if (outcome === 'remove') {
      membership.deletedAt = now
      written.removedMemberships.push(membership)
    } else {
      membership.validTo = plan.lastDay
      written.endedMemberships.push(membership)
    }
    membership.updatedAt = now
  }
}

const rolloverCommand: CommandHandler<Record<string, unknown>, RolloverCommandResult> = {
  id: 'groups.seasons.rollover',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const written: Written = {
      season: null,
      createdGroups: [],
      updatedGroups: [],
      endedMemberships: [],
      removedMemberships: [],
      changes: {},
      continuedGroupIds: [],
    }
    const applied = await mapNameViolation(() =>
      inWriteTransaction(ctx, 'groups.seasons.rollover', async (em) => {
        const authorized = await authorizeScoped(rolloverSpec(rolloverApplySchema), rawInput, ctx, em)
        const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
        const parsed = authorized.parsed
        const today = await clubToday(ctx.container, scope)
        const createdSeasonId = 'id' in parsed.season ? null : randomUUID()
        const built = await buildRollover(em, ctx, scope, authorized.scope, parsed, {
          today,
          forApply: true,
          createdSeasonId,
        })
        const binding = { ...scope, actorUserId: ctx.auth?.sub ?? '', plan: planOf(parsed), content: built.binding }
        if (checkRolloverToken(parsed.previewToken, binding, Date.now()) !== 'valid') {
          await groupsErrors.throw('rollover_plan_stale')
        }
        if (built.view.conflicts.length > 0) {
          await groupsErrors.throw('rollover_conflicts', { conflicts: built.view.conflicts })
        }
        if (createdSeasonId && !('id' in parsed.season)) {
          const season = em.create(Season, {
            id: createdSeasonId,
            ...scope,
            name: parsed.season.name,
            startsOn: parsed.season.startsOn,
            endsOn: parsed.season.endsOn,
          })
          em.persist(season)
          written.season = season
          await em.flush()
        }
        const rows = parsed.groups as RolloverGroupRow[]
        const ageCategories = new Map(
          parsed.groups.flatMap((row, index) =>
            row.ageCategoryEntryId !== undefined ? [[index, row.ageCategoryEntryId] as const] : [],
          ),
        )
        applyGroups(em, built, rows, ageCategories, written)
        await em.flush()
        const copies: Record<string, string> = {}
        for (const { module, contributor } of seasonContributors(ctx.container)) {
          const result = await contributor.apply(
            em,
            built.plan,
            { container: ctx.container, command: ctx, rules: seasonRolloverRules },
            copies,
          )
          written.changes[module] = result.changes
          Object.assign(copies, result.copies)
        }
        await em.flush()
        const continued = continuedGroupIds(rows)
        return {
          actingRole: authorized.actingRole,
          scope,
          seasonId: built.plan.toSeason.id,
          fromSeasonId: built.plan.fromSeason.id,
          seasonName: built.plan.toSeason.name,
          seasonStartsOn: built.plan.toSeason.startsOn,
          announce: parsed.announce,
          groups: {
            continued: rows.filter((row) => row.action === 'continue').length,
            renamed: rows.filter((row) => row.action === 'rename').length,
            closed: closedGroupIds(rows).size,
            copied: rows.filter((row) => row.action === 'copy').length,
          },
          continuedCount: continued.size,
        }
      }),
    )
    const scope = applied.scope
    await afterCommit(ctx, scope, written)
    await emitGroupsEvent(
      'groups.season.rolled_over',
      {
        id: applied.seasonId,
        ...scope,
        fromSeasonId: applied.fromSeasonId,
        groupIds: written.continuedGroupIds,
        createdGroupIds: written.createdGroups.map((group) => group.id),
        closedGroupIds: written.updatedGroups.filter((group) => !group.isActive).map((group) => group.id),
        announce: applied.announce,
      },
      { persistent: true, ...scope },
    )
    const announced = applied.announce
      ? await announce(ctx, scope, written.continuedGroupIds, {
          seasonName: applied.seasonName,
          startsOn: applied.seasonStartsOn,
        })
      : 0
    const modules: RolloverSummary['modules'] = {}
    for (const [module, changes] of Object.entries(written.changes)) {
      modules[module as SeasonContributorModule] = changes?.length ?? 0
    }
    return {
      ...scope,
      actingRole: applied.actingRole,
      fromSeasonId: applied.fromSeasonId,
      summary: {
        seasonId: applied.seasonId,
        seasonCreated: written.season !== null,
        groups: applied.groups,
        membershipsEnded: written.endedMemberships.length + written.removedMemberships.length,
        modules,
        announced,
      },
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('groups.audit.seasons.rollover', 'Start a new season'),
      resourceKind: ROLLOVER_RESOURCE_KIND,
      resourceId: result.summary.seasonId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      snapshotAfter: result.summary,
      context: { actingRole: result.actingRole, fromSeasonId: result.fromSeasonId },
    }
  },
}

/** A concurrent create of a season with the plan's name meets the partial unique index: 409 `season_name_taken`. */
async function mapNameViolation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return groupsErrors.throw('season_name_taken', { field: 'season.name' })
    throw error
  }
}

/** The events of what `groups` wrote and the contributors' `afterCommit`; failures are logged, never rolled back. */
async function afterCommit(ctx: CommandRuntimeContext, scope: GroupsScope, written: Written): Promise<void> {
  try {
    if (written.season) await emitGroupsSideEffects(ctx, written.season, 'created', seasonEvents)
    for (const group of written.createdGroups) await emitGroupsSideEffects(ctx, group, 'created', groupEvents)
    for (const group of written.updatedGroups) await emitGroupsSideEffects(ctx, group, 'updated', groupEvents)
    for (const row of written.endedMemberships) await emitGroupsSideEffects(ctx, row, 'updated', membershipEvents)
    for (const row of written.removedMemberships) await emitGroupsSideEffects(ctx, row, 'deleted', membershipEvents)
  } catch (error: unknown) {
    logger.warn('The season rollover events failed after the commit', { err: error })
    getTelemetryRuntime()?.reportError(error, { module: 'groups', code: 'groups.season.rollover_events_failed' })
  }
  for (const { module, contributor } of seasonContributors(ctx.container)) {
    const changes = written.changes[module]
    if (!changes || changes.length === 0) continue
    try {
      await contributor.afterCommit(changes, { container: ctx.container, ...scope })
    } catch (error: unknown) {
      logger.warn('A season contributor failed after the commit', { module, err: error })
      getTelemetryRuntime()?.reportError(error, { module: 'groups', code: 'groups.season.after_commit_failed' })
    }
  }
}

/**
 * "Announce in the group threads" (J-L06 step 5): one announcement per continued or renamed group, to the group's
 * audience, naming the new season and its first session, posted through `communication.threads.create` as the actor
 * (the author of an announcement is a person; a subscriber has none). It runs once, after the commit of a rollover
 * that moved the groups — a second apply of the plan is stale and posts nothing. A failure is logged and counted out.
 */
async function announce(
  ctx: CommandRuntimeContext,
  scope: GroupsScope,
  groupIds: readonly string[],
  season: { seasonName: string; startsOn: string },
): Promise<number> {
  if (groupIds.length === 0 || !ctx.container.hasRegistration('commandBus')) return 0
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const groups = await em.find(Group, { ...scope, id: { $in: [...groupIds] }, deletedAt: null })
  const firstSessions: Record<string, string> = {}
  for (const { contributor } of seasonContributors(ctx.container)) {
    if (!contributor.firstSessions) continue
    Object.assign(firstSessions, await contributor.firstSessions(em, scope, groupIds, season.startsOn))
  }
  const { translate } = await resolveTranslations()
  const commandBus = ctx.container.resolve<CommandBus>('commandBus')
  let posted = 0
  for (const group of groups) {
    const first = firstSessions[group.id]
    const params = { season: season.seasonName, group: group.name, startsOn: season.startsOn }
    const body = first
      ? translate('groups.rollover.announcement.bodyWithSession', '', { ...params, firstSession: first.slice(0, 10) })
      : translate('groups.rollover.announcement.body', '', params)
    try {
      await commandBus.execute('communication.threads.create', {
        input: {
          audience: { kind: 'group', ids: [group.id] },
          subject: translate('groups.rollover.announcement.subject', '', params),
          body,
        },
        ctx,
      })
      posted += 1
    } catch (error: unknown) {
      logger.warn('The season announcement could not be posted', { groupId: group.id, err: error })
      getTelemetryRuntime()?.reportError(error, { module: 'groups', code: 'groups.season.announcement_failed' })
    }
  }
  return posted
}

registerCommand(rolloverCommand)
