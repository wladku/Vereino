// `facilities.rental_rates.create|update|delete` (facilities spec *Data Models* → `facilities_rental_rates`, the CRUD
// row; REQ-013; #121): the price of one 90-minute unit per place and renter category, optionally for a season
// `MM-DD`–`MM-DD` and with lighting, kept by the club administrator. A season with one bound or a day that does not
// exist answers 422 `rental_rate_season_invalid`; a second rate for the same place, category, validity and season 409
// `rental_rate_overlap` (serialized per organization by the rates advisory lock), so a quote always finds one rate.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isInvertedPeriod } from '@vereino/core'
import { authorizeScoped, foundationErrors } from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { RentalRate } from '../data/entities'
import { lockRentalRates } from '../data/queries'
import { rentalRateCreateSchema, rentalRateDeleteSchema, rentalRateUpdateSchema } from '../data/validators'
import { conflictingRate, rateSeasonProblem, type RentalRateShape } from '../lib/rates'
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
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

export const RENTAL_RATE_RESOURCE_KIND = 'facilities.rental_rate'

export type RentalRateSnapshot = RentalRateShape & { id: string; tenantId: string; organizationId: string }

export type RentalRateCommandResult = FacilitiesCommandResult<RentalRate, RentalRateSnapshot>

type Scope = { tenantId: string; organizationId: string }

export function rentalRateShapeOf(row: RentalRate): RentalRateShape {
  return {
    id: row.id,
    placeId: row.placeId,
    renterCategory: row.renterCategory,
    pricePer90: row.pricePer90,
    seasonFrom: row.seasonFrom ?? null,
    seasonTo: row.seasonTo ?? null,
    includesLighting: row.includesLighting,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}

export function rentalRateSnapshot(row: RentalRate): RentalRateSnapshot {
  return { ...rentalRateShapeOf(row), id: row.id, tenantId: row.tenantId, organizationId: row.organizationId }
}

function restoreRate(row: RentalRate, before: RentalRateShape): void {
  row.placeId = before.placeId
  row.renterCategory = before.renterCategory
  row.pricePer90 = before.pricePer90
  row.seasonFrom = before.seasonFrom
  row.seasonTo = before.seasonTo
  row.includesLighting = before.includesLighting
  row.validFrom = before.validFrom
  row.validTo = before.validTo
}

/** 422 for a broken season, 409 for an ambiguous second rate; runs under the rates lock. */
async function assertRateFits(em: EntityManager, scope: Scope, candidate: RentalRateShape): Promise<void> {
  const problem = rateSeasonProblem(candidate)
  if (problem) await throwFieldError('rental_rate_season_invalid', 'seasonFrom', { problem })
  await lockRentalRates(em, scope.organizationId)
  const rows = await em.find(RentalRate, {
    ...scope,
    placeId: candidate.placeId,
    renterCategory: candidate.renterCategory,
    deletedAt: null,
  })
  const conflict = conflictingRate(candidate, rows.map(rentalRateShapeOf))
  if (conflict) await facilitiesErrors.throw('rental_rate_overlap', { conflictingRateId: conflict.id })
}

async function emitRate(row: RentalRate, action: 'created' | 'updated' | 'deleted'): Promise<void> {
  await emitAfterCommit(
    `facilities.rental_rate.${action}`,
    { tenantId: row.tenantId, organizationId: row.organizationId },
    { id: row.id },
  )
}

function replayLoader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return rowLoader(ctx, RentalRate, includeDeleted)
}

const createRateCommand: CommandHandler<Record<string, unknown>, RentalRateCommandResult> = {
  id: 'facilities.rental_rates.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'facilities.rental_rates.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: rentalRateCreateSchema,
          resourceKind: RENTAL_RATE_RESOURCE_KIND,
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
      const shape: RentalRateShape = {
        id,
        placeId: parsed.placeId,
        renterCategory: parsed.renterCategory,
        pricePer90: parsed.pricePer90,
        seasonFrom: parsed.seasonFrom ?? null,
        seasonTo: parsed.seasonTo ?? null,
        includesLighting: parsed.includesLighting ?? false,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo ?? null,
      }
      await assertRateFits(em, scope, shape)
      const row = em.create(RentalRate, { ...shape, id, ...scope })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitRate(result.entity, 'created')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: RENTAL_RATE_RESOURCE_KIND,
      labelKey: 'facilities.audit.rates.create',
      fallback: 'Create a rental rate',
      after: rentalRateSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, RENTAL_RATE_RESOURCE_KIND, logEntry.resourceId, replayLoader(ctx, true))
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeReplay(ctx, RENTAL_RATE_RESOURCE_KIND, logEntry.resourceId, replayLoader(ctx))
    row.deletedAt = new Date()
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
    await emitRate(row, 'deleted')
  },
}

const updateRateCommand: CommandHandler<Record<string, unknown>, RentalRateCommandResult> = {
  id: 'facilities.rental_rates.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.rental_rates.update', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(rentalRateUpdateSchema, RENTAL_RATE_RESOURCE_KIND, rowLoader(ctx, RentalRate)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as RentalRate
      const patch = authorized.parsed
      const before = rentalRateSnapshot(row)
      const next: RentalRateShape = {
        ...rentalRateShapeOf(row),
        ...(patch.pricePer90 !== undefined ? { pricePer90: patch.pricePer90 } : {}),
        ...(patch.seasonFrom !== undefined ? { seasonFrom: patch.seasonFrom } : {}),
        ...(patch.seasonTo !== undefined ? { seasonTo: patch.seasonTo } : {}),
        ...(patch.includesLighting !== undefined ? { includesLighting: patch.includesLighting } : {}),
        ...(patch.validFrom !== undefined ? { validFrom: patch.validFrom } : {}),
        ...(patch.validTo !== undefined ? { validTo: patch.validTo } : {}),
      }
      if (isInvertedPeriod(next.validFrom, next.validTo)) await foundationErrors.throw('validity_inverted')
      await assertRateFits(em, { tenantId: row.tenantId, organizationId: row.organizationId }, next)
      restoreRate(row, next)
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitRate(result.entity, 'updated')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: RENTAL_RATE_RESOURCE_KIND,
      labelKey: 'facilities.audit.rates.update',
      fallback: 'Change a rental rate',
      after: rentalRateSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, RENTAL_RATE_RESOURCE_KIND, logEntry.resourceId, replayLoader(ctx))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as RentalRateSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing rental rate snapshot for undo')
    const row = await authorizeReplay(ctx, RENTAL_RATE_RESOURCE_KIND, before.id, replayLoader(ctx))
    const em = ctx.transactionalEm as EntityManager
    await assertRateFits(em, { tenantId: row.tenantId, organizationId: row.organizationId }, before)
    restoreRate(row, before)
    row.updatedAt = new Date()
    await em.flush()
    await emitRate(row, 'updated')
  },
}

const deleteRateCommand: CommandHandler<Record<string, unknown>, RentalRateCommandResult> = {
  id: 'facilities.rental_rates.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.rental_rates.delete', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(rentalRateDeleteSchema, RENTAL_RATE_RESOURCE_KIND, rowLoader(ctx, RentalRate)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as RentalRate
      const before = rentalRateSnapshot(row)
      const now = new Date()
      row.deletedAt = now
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitRate(result.entity, 'deleted')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: RENTAL_RATE_RESOURCE_KIND,
      labelKey: 'facilities.audit.rates.delete',
      fallback: 'Delete a rental rate',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, RENTAL_RATE_RESOURCE_KIND, logEntry.resourceId, replayLoader(ctx, true))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as RentalRateSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing rental rate snapshot for undo')
    const row = await authorizeReplay(ctx, RENTAL_RATE_RESOURCE_KIND, before.id, replayLoader(ctx, true))
    const em = ctx.transactionalEm as EntityManager
    await assertRateFits(em, { tenantId: row.tenantId, organizationId: row.organizationId }, before)
    restoreRate(row, before)
    row.deletedAt = null
    row.updatedAt = new Date()
    await em.flush()
    await emitRate(row, 'created')
  },
}

registerCommand(createRateCommand)
registerCommand(updateRateCommand)
registerCommand(deleteRateCommand)
