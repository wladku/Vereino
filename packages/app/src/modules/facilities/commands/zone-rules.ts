// `facilities.zone_rules.create|update|delete` (facilities spec glossary *Zone*, the CRUD row of *API, Command, and
// Error Contracts*; REQ-013; #121): the weekly zones of a place from the facility regulations, kept by the club
// administrator. A rule on an unknown place answers 422 `facilities_reference_invalid`; weekdays or times out of order
// 422 `zone_rule_times_invalid`; a rule that overlaps a live rule of the same place with equal priority 409
// `zone_rule_overlap` — the check and the write are serialized per organization by the zone advisory lock.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isInvertedPeriod } from '@vereino/core'
import { authorizeScoped, foundationErrors } from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { ZoneRule } from '../data/entities'
import { lockZoneRules } from '../data/queries'
import { zoneRuleCreateSchema, zoneRuleDeleteSchema, zoneRuleUpdateSchema } from '../data/validators'
import { conflictingZoneRule, wallTimeOf, zoneRuleShapeProblem, type ZoneRuleShape } from '../lib/zones'
import {
  MANAGE_KINDS,
  assertPlaces,
  authorizeReplay,
  emitAfterCommit,
  existingSpec,
  facilitiesLog,
  facilityTarget,
  inWriteTransaction,
  rowLoader,
  type FacilitiesCommandResult,
} from './shared'
import { zoneRuleShapeOf } from '../data/shapes'

export { zoneRuleShapeOf }

export const ZONE_RULE_RESOURCE_KIND = 'facilities.zone_rule'

export type ZoneRuleSnapshot = ZoneRuleShape & { id: string; tenantId: string; organizationId: string }

export type ZoneRuleCommandResult = FacilitiesCommandResult<ZoneRule, ZoneRuleSnapshot>

type Scope = { tenantId: string; organizationId: string }

export function zoneRuleSnapshot(row: ZoneRule): ZoneRuleSnapshot {
  return { ...zoneRuleShapeOf(row), id: row.id, tenantId: row.tenantId, organizationId: row.organizationId }
}

function restoreZoneRule(row: ZoneRule, before: ZoneRuleSnapshot): void {
  row.placeId = before.placeId
  row.weekdays = [...before.weekdays]
  row.timeFrom = before.timeFrom
  row.timeTo = before.timeTo
  row.zone = before.zone
  row.priority = before.priority
  row.source = before.source
  row.validFrom = before.validFrom
  row.validTo = before.validTo
}

/** The live rules of the places, as shapes (the overlap check reads them under the zone lock). */
export async function liveZoneRules(
  em: EntityManager,
  scope: Scope,
  placeIds: readonly string[],
): Promise<Array<ZoneRuleShape & { row: ZoneRule }>> {
  if (placeIds.length === 0) return []
  const rows = await em.find(ZoneRule, { ...scope, placeId: { $in: [...new Set(placeIds)] }, deletedAt: null })
  return rows.map((row) => ({ ...zoneRuleShapeOf(row), row }))
}

/** 422 for weekdays or times out of order, 409 for an equal-priority overlap with a live rule of the place. */
export async function assertZoneRuleFits(em: EntityManager, scope: Scope, candidate: ZoneRuleShape): Promise<void> {
  const problem = zoneRuleShapeProblem(candidate)
  if (problem) await facilitiesErrors.throw('zone_rule_times_invalid', { problem })
  const conflict = conflictingZoneRule(candidate, await liveZoneRules(em, scope, [candidate.placeId]))
  if (conflict) await facilitiesErrors.throw('zone_rule_overlap', { conflictingRuleId: conflict.id })
}

async function emitZoneRule(row: ZoneRule, action: 'created' | 'updated' | 'deleted'): Promise<void> {
  await emitAfterCommit(
    `facilities.zone_rule.${action}`,
    { tenantId: row.tenantId, organizationId: row.organizationId },
    { id: row.id, placeId: row.placeId },
  )
}

function replayLoader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return rowLoader(ctx, ZoneRule, includeDeleted)
}

const createZoneRuleCommand: CommandHandler<Record<string, unknown>, ZoneRuleCommandResult> = {
  id: 'facilities.zone_rules.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'facilities.zone_rules.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: zoneRuleCreateSchema,
          resourceKind: ZONE_RULE_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => facilityTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      await lockZoneRules(em, organizationId)
      const shape: ZoneRuleShape = {
        id,
        placeId: parsed.placeId,
        weekdays: [...new Set(parsed.weekdays)].sort((a, b) => a - b),
        timeFrom: wallTimeOf(parsed.timeFrom),
        timeTo: wallTimeOf(parsed.timeTo),
        zone: parsed.zone,
        priority: parsed.priority,
        source: parsed.source ?? 'regulations',
        validFrom: parsed.validFrom,
        validTo: parsed.validTo ?? null,
      }
      await assertZoneRuleFits(em, scope, shape)
      const row = em.create(ZoneRule, { ...shape, id, ...scope, weekdays: [...shape.weekdays] })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitZoneRule(result.entity, 'created')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: ZONE_RULE_RESOURCE_KIND,
      labelKey: 'facilities.audit.zoneRules.create',
      fallback: 'Create a zone rule',
      after: zoneRuleSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, ZONE_RULE_RESOURCE_KIND, logEntry.resourceId, replayLoader(ctx, true))
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeReplay(ctx, ZONE_RULE_RESOURCE_KIND, logEntry.resourceId, replayLoader(ctx))
    row.deletedAt = new Date()
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
    await emitZoneRule(row, 'deleted')
  },
}

const updateZoneRuleCommand: CommandHandler<Record<string, unknown>, ZoneRuleCommandResult> = {
  id: 'facilities.zone_rules.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.zone_rules.update', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(zoneRuleUpdateSchema, ZONE_RULE_RESOURCE_KIND, rowLoader(ctx, ZoneRule)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as ZoneRule
      const patch = authorized.parsed
      const before = zoneRuleSnapshot(row)
      const next: ZoneRuleShape = {
        ...zoneRuleShapeOf(row),
        ...(patch.weekdays !== undefined ? { weekdays: [...new Set(patch.weekdays)].sort((a, b) => a - b) } : {}),
        ...(patch.timeFrom !== undefined ? { timeFrom: wallTimeOf(patch.timeFrom) } : {}),
        ...(patch.timeTo !== undefined ? { timeTo: wallTimeOf(patch.timeTo) } : {}),
        ...(patch.zone !== undefined ? { zone: patch.zone } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
        ...(patch.validFrom !== undefined ? { validFrom: patch.validFrom } : {}),
        ...(patch.validTo !== undefined ? { validTo: patch.validTo } : {}),
      }
      if (isInvertedPeriod(next.validFrom, next.validTo)) await foundationErrors.throw('validity_inverted')
      await lockZoneRules(em, row.organizationId)
      await assertZoneRuleFits(em, { tenantId: row.tenantId, organizationId: row.organizationId }, next)
      restoreZoneRule(row, { ...before, ...next, id: row.id })
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitZoneRule(result.entity, 'updated')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: ZONE_RULE_RESOURCE_KIND,
      labelKey: 'facilities.audit.zoneRules.update',
      fallback: 'Change a zone rule',
      after: zoneRuleSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, ZONE_RULE_RESOURCE_KIND, logEntry.resourceId, replayLoader(ctx))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ZoneRuleSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing zone rule snapshot for undo')
    const row = await authorizeReplay(ctx, ZONE_RULE_RESOURCE_KIND, before.id, replayLoader(ctx))
    const em = ctx.transactionalEm as EntityManager
    await lockZoneRules(em, row.organizationId)
    await assertZoneRuleFits(em, { tenantId: row.tenantId, organizationId: row.organizationId }, before)
    restoreZoneRule(row, before)
    row.updatedAt = new Date()
    await em.flush()
    await emitZoneRule(row, 'updated')
  },
}

const deleteZoneRuleCommand: CommandHandler<Record<string, unknown>, ZoneRuleCommandResult> = {
  id: 'facilities.zone_rules.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.zone_rules.delete', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(zoneRuleDeleteSchema, ZONE_RULE_RESOURCE_KIND, rowLoader(ctx, ZoneRule)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as ZoneRule
      const before = zoneRuleSnapshot(row)
      const now = new Date()
      row.deletedAt = now
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitZoneRule(result.entity, 'deleted')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: ZONE_RULE_RESOURCE_KIND,
      labelKey: 'facilities.audit.zoneRules.delete',
      fallback: 'Delete a zone rule',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, ZONE_RULE_RESOURCE_KIND, logEntry.resourceId, replayLoader(ctx, true))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ZoneRuleSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing zone rule snapshot for undo')
    const row = await authorizeReplay(ctx, ZONE_RULE_RESOURCE_KIND, before.id, replayLoader(ctx, true))
    const em = ctx.transactionalEm as EntityManager
    await lockZoneRules(em, row.organizationId)
    await assertZoneRuleFits(em, { tenantId: row.tenantId, organizationId: row.organizationId }, before)
    restoreZoneRule(row, before)
    row.deletedAt = null
    row.updatedAt = new Date()
    await em.flush()
    await emitZoneRule(row, 'created')
  },
}

registerCommand(createZoneRuleCommand)
registerCommand(updateZoneRuleCommand)
registerCommand(deleteZoneRuleCommand)
