// `groups.seasons.create|update|delete` (club spec *Data Models* → `groups_seasons`, REQ-019): the club-wide season
// dictionary of `team` groups, written by the club administrator and every coordinator. A name is unique among the
// live seasons of the club (409 `season_name_taken`, backed by a partial unique index); the last day may not precede
// the first (422 `season_dates_inverted`); a season named by a live group is not deleted (409 `season_in_use`) — the
// delete holds the season's row lock, which the group writes that name a season also take.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { groupsErrors } from '../api/errors'
import { Group, Season } from '../data/entities'
import { seasonCreateSchema, seasonDeleteSchema, seasonUpdateSchema } from '../data/validators'
import { seasonDatesInverted } from '../lib/groups-rules'
import {
  DICTIONARY_WRITE_KINDS,
  DICTIONARY_WRITE_OPTIONS,
  dictionaryTarget,
  emitGroupsSideEffects,
  groupsEvents,
  groupsLog,
  inWriteTransaction,
  isUniqueViolation,
  trustedTenantId,
  undoCreate,
  undoRestore,
  type GroupsCommandResult,
  type GroupsScope,
} from './shared'

export const SEASON_RESOURCE_KIND = 'groups.season'

export const seasonEvents = groupsEvents<Season>('season')

export type SeasonSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  name: string
  startsOn: string
  endsOn: string
}

export type SeasonCommandResult = GroupsCommandResult<Season, SeasonSnapshot>

export function seasonSnapshot(row: Season): SeasonSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    name: row.name,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
  }
}

function restoreSeason(row: Season, before: SeasonSnapshot): void {
  row.name = before.name
  row.startsOn = before.startsOn
  row.endsOn = before.endsOn
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Season | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Season, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<Season | null>,
): AuthorizeScopedSpec<TSchema, Season> {
  return {
    input,
    resourceKind: SEASON_RESOURCE_KIND,
    allowedKinds: DICTIONARY_WRITE_KINDS,
    matchOptions: DICTIONARY_WRITE_OPTIONS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => dictionaryTarget(entity as Season),
  }
}

async function authorizeSeasonReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<Season> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] season replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), loader(ctx, includeDeleted)),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Season
}

/** 409 `season_name_taken` when another live season of the club has the name. */
async function assertNameFree(em: EntityManager, scope: GroupsScope, name: string, exceptId: string | null) {
  const other = await em.findOne(
    Season,
    { ...scope, name, deletedAt: null, ...(exceptId ? { id: { $ne: exceptId } } : {}) },
    { fields: ['id'] },
  )
  if (other) await groupsErrors.throw('season_name_taken')
}

async function assertDates(startsOn: string, endsOn: string): Promise<void> {
  if (seasonDatesInverted(startsOn, endsOn)) await groupsErrors.throw('season_dates_inverted')
}

/** Flushes and maps the partial unique index of season names to 409 (a concurrent create with the same name). */
async function flushSeason(em: EntityManager): Promise<void> {
  try {
    await em.flush()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) await groupsErrors.throw('season_name_taken')
    throw error
  }
}

const createSeasonCommand: CommandHandler<Record<string, unknown>, SeasonCommandResult> = {
  id: 'groups.seasons.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'groups.seasons.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: seasonCreateSchema,
          resourceKind: SEASON_RESOURCE_KIND,
          allowedKinds: DICTIONARY_WRITE_KINDS,
          matchOptions: DICTIONARY_WRITE_OPTIONS,
          resolveTarget: (_parsed, _entity, scope) => dictionaryTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      await assertDates(parsed.startsOn, parsed.endsOn)
      await assertNameFree(em, { tenantId, organizationId }, parsed.name, null)
      const row = em.create(Season, {
        id,
        tenantId,
        organizationId,
        name: parsed.name,
        startsOn: parsed.startsOn,
        endsOn: parsed.endsOn,
      })
      em.persist(row)
      await flushSeason(em)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'created', seasonEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: SEASON_RESOURCE_KIND,
      labelKey: 'groups.audit.seasons.create',
      fallback: 'Create a season',
      after: seasonSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeSeasonReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeSeasonReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
    if ((await countGroupsOfSeason(em, scope, row.id)) > 0) await groupsErrors.throw('season_in_use')
    await undoCreate(ctx, row, seasonEvents)
  },
}

const updateSeasonCommand: CommandHandler<Record<string, unknown>, SeasonCommandResult> = {
  id: 'groups.seasons.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.seasons.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(seasonUpdateSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as Season
      const before = seasonSnapshot(row)
      const patch = authorized.parsed
      const name = patch.name ?? row.name
      const startsOn = patch.startsOn ?? row.startsOn
      const endsOn = patch.endsOn ?? row.endsOn
      await assertDates(startsOn, endsOn)
      if (name !== row.name) {
        await assertNameFree(em, { tenantId: row.tenantId, organizationId: row.organizationId }, name, row.id)
      }
      row.name = name
      row.startsOn = startsOn
      row.endsOn = endsOn
      row.updatedAt = new Date()
      await flushSeason(em)
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'updated', seasonEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: SEASON_RESOURCE_KIND,
      labelKey: 'groups.audit.seasons.update',
      fallback: 'Change a season',
      after: seasonSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeSeasonReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as SeasonSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing season snapshot for undo')
    const row = await authorizeSeasonReplay(ctx, before.id)
    const em = ctx.transactionalEm as EntityManager
    await assertNameFree(em, { tenantId: row.tenantId, organizationId: row.organizationId }, before.name, row.id)
    await undoRestore(ctx, row, before, restoreSeason, seasonEvents, 'updated')
  },
}

/** Number of live groups that name the season. */
async function countGroupsOfSeason(em: EntityManager, scope: GroupsScope, seasonId: string): Promise<number> {
  return em.count(Group, { ...scope, seasonId, deletedAt: null })
}

const deleteSeasonCommand: CommandHandler<Record<string, unknown>, SeasonCommandResult> = {
  id: 'groups.seasons.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.seasons.delete', async (em) => {
      const authorized = await authorizeScoped(existingSpec(seasonDeleteSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as Season
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      if ((await countGroupsOfSeason(em, scope, row.id)) > 0) await groupsErrors.throw('season_in_use')
      const before = seasonSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'deleted', seasonEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: SEASON_RESOURCE_KIND,
      labelKey: 'groups.audit.seasons.delete',
      fallback: 'Delete a season',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeSeasonReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as SeasonSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing season snapshot for undo')
    const row = await authorizeSeasonReplay(ctx, before.id, true)
    const em = ctx.transactionalEm as EntityManager
    await assertNameFree(em, { tenantId: row.tenantId, organizationId: row.organizationId }, before.name, row.id)
    await undoRestore(ctx, row, before, restoreSeason, seasonEvents, 'created')
  },
}

registerCommand(createSeasonCommand)
registerCommand(updateSeasonCommand)
registerCommand(deleteSeasonCommand)
