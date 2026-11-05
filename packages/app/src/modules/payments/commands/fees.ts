// `payments.fees.create|update|delete` (payments spec *Data Models* → `payments_fees`, REQ-011, REQ-018; B-20; issue
// #108): a fee schedule with exactly one target — a group or an activity (422 `fee_target_invalid` "Choose exactly
// one: a group or an activity"), which must be a live record of the club (422 `fee_target_unknown`); the amount, the
// period, the payment day 1–28 and the validity. Written by the club administrator. Charges already issued keep
// their amounts, and a fee's period cannot change once it has charges (422 `fee_period_locked`).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { isInvertedPeriod } from '@vereino/core'
import { authorizeScoped, foundationErrors, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { Charge, Fee } from '../data/entities'
import { feeCreateSchema, feeDeleteSchema, feeUpdateSchema } from '../data/validators'
import { feeTargetInvalid, type FeePeriod } from '../lib/payments-rules'
import { findActivities, findGroups, type PaymentsScope } from '../services/directory'
import {
  PAYMENTS_WRITE_KINDS,
  clubTarget,
  emitPaymentsSideEffects,
  inWriteTransaction,
  paymentsEvents,
  paymentsLog,
  trustedTenantId,
  undoCreate,
  undoRestore,
  type PaymentsCommandResult,
} from './shared'

export const FEE_RESOURCE_KIND = 'payments.fee'

export const feeEvents = paymentsEvents<Fee>('fee')

export type FeeSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  name: string
  amount: number
  period: FeePeriod
  groupId: string | null
  activityId: string | null
  dueDay: number
  validFrom: string
  validTo: string | null
}

export type FeeCommandResult = PaymentsCommandResult<Fee, FeeSnapshot>

export function feeSnapshot(row: Fee): FeeSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    name: row.name,
    amount: row.amount,
    period: row.period,
    groupId: row.groupId ?? null,
    activityId: row.activityId ?? null,
    dueDay: row.dueDay,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}

function restoreFee(row: Fee, before: FeeSnapshot): void {
  row.name = before.name
  row.amount = before.amount
  row.period = before.period
  row.groupId = before.groupId
  row.activityId = before.activityId
  row.dueDay = before.dueDay
  row.validFrom = before.validFrom
  row.validTo = before.validTo
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Fee | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Fee, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<Fee | null>,
): AuthorizeScopedSpec<TSchema, Fee> {
  return {
    input,
    resourceKind: FEE_RESOURCE_KIND,
    allowedKinds: PAYMENTS_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => clubTarget(entity as Fee),
  }
}

async function authorizeFeeReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<Fee> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] fee replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), loader(ctx, includeDeleted)),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Fee
}

/** 422 unless exactly one target is set and it is a live group or activity of the club. */
async function assertTarget(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: PaymentsScope,
  target: { groupId: string | null; activityId: string | null },
): Promise<void> {
  if (feeTargetInvalid(target)) await paymentsErrors.throw('fee_target_invalid')
  if (target.groupId) {
    const groups = await findGroups(ctx.container, scope, [target.groupId], em)
    if (!groups.has(target.groupId)) await paymentsErrors.throw('fee_target_unknown', { field: 'groupId' })
  } else if (target.activityId) {
    const activities = await findActivities(ctx.container, scope, [target.activityId], em)
    if (!activities.has(target.activityId)) await paymentsErrors.throw('fee_target_unknown', { field: 'activityId' })
  }
}

const createFeeCommand: CommandHandler<Record<string, unknown>, FeeCommandResult> = {
  id: 'payments.fees.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'payments.fees.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: feeCreateSchema,
          resourceKind: FEE_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const target = { groupId: parsed.groupId ?? null, activityId: parsed.activityId ?? null }
      await assertTarget(ctx, em, { tenantId, organizationId }, target)
      const row = em.create(Fee, {
        id,
        tenantId,
        organizationId,
        name: parsed.name,
        amount: parsed.amount,
        period: parsed.period,
        ...target,
        dueDay: parsed.dueDay,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo ?? null,
      })
      em.persist(row)
      await em.flush()
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'created', feeEvents)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: FEE_RESOURCE_KIND,
      labelKey: 'payments.audit.fees.create',
      fallback: 'Create a fee schedule',
      after: feeSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeFeeReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeFeeReplay(ctx, logEntry.resourceId)
    await undoCreate(ctx, row, feeEvents)
  },
}

const updateFeeCommand: CommandHandler<Record<string, unknown>, FeeCommandResult> = {
  id: 'payments.fees.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.fees.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(feeUpdateSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as Fee
      const before = feeSnapshot(row)
      const patch = authorized.parsed
      const target = {
        groupId: patch.groupId !== undefined ? patch.groupId : (row.groupId ?? null),
        activityId: patch.activityId !== undefined ? patch.activityId : (row.activityId ?? null),
      }
      const validFrom = patch.validFrom ?? row.validFrom
      const validTo = patch.validTo !== undefined ? patch.validTo : (row.validTo ?? null)
      if (isInvertedPeriod(validFrom, validTo)) await foundationErrors.throw('validity_inverted')
      if (target.groupId !== (row.groupId ?? null) || target.activityId !== (row.activityId ?? null)) {
        await assertTarget(ctx, em, { tenantId: row.tenantId, organizationId: row.organizationId }, target)
      } else if (feeTargetInvalid(target)) {
        await paymentsErrors.throw('fee_target_invalid')
      }
      // A fee's charges are keyed by fee and period label, so its period is fixed once it has billed anyone.
      if (patch.period !== undefined && patch.period !== row.period) {
        const charged = await em.count(Charge, {
          tenantId: row.tenantId,
          organizationId: row.organizationId,
          sourceType: 'fee',
          sourceId: row.id,
          deletedAt: null,
        })
        if (charged > 0) await paymentsErrors.throw('fee_period_locked')
      }
      row.name = patch.name ?? row.name
      row.amount = patch.amount ?? row.amount
      row.period = patch.period ?? row.period
      row.groupId = target.groupId
      row.activityId = target.activityId
      row.dueDay = patch.dueDay ?? row.dueDay
      row.validFrom = validFrom
      row.validTo = validTo
      row.updatedAt = new Date()
      await em.flush()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'updated', feeEvents)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: FEE_RESOURCE_KIND,
      labelKey: 'payments.audit.fees.update',
      fallback: 'Change a fee schedule',
      after: feeSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeFeeReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as FeeSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing fee snapshot for undo')
    const row = await authorizeFeeReplay(ctx, before.id)
    await undoRestore(ctx, row, before, restoreFee, feeEvents, 'updated')
  },
}

const deleteFeeCommand: CommandHandler<Record<string, unknown>, FeeCommandResult> = {
  id: 'payments.fees.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.fees.delete', async (em) => {
      const authorized = await authorizeScoped(existingSpec(feeDeleteSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as Fee
      const before = feeSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'deleted', feeEvents)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: FEE_RESOURCE_KIND,
      labelKey: 'payments.audit.fees.delete',
      fallback: 'Delete a fee schedule',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeFeeReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as FeeSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing fee snapshot for undo')
    const row = await authorizeFeeReplay(ctx, before.id, true)
    await undoRestore(ctx, row, before, restoreFee, feeEvents, 'created')
  },
}

registerCommand(createFeeCommand)
registerCommand(updateFeeCommand)
registerCommand(deleteFeeCommand)
