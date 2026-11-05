// `payments.discount_rules.create|update|delete` (payments spec *Data Models* → `payments_discount_rules`; R12, Q-006;
// B-20 Discounts; issue #108): a `sibling` rule — a percent 1–100, which child pays the full rate (default the oldest)
// and which fee periods it covers (default monthly only) — or a `custom` rule — a percent or an amount for named
// persons. A bad value answers 422 `discount_value_invalid`, a custom rule without persons or a rule without fee
// periods 422 `discount_conditions_invalid`. The kind is fixed at creation. Written by the club administrator.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { isInvertedPeriod } from '@vereino/core'
import { authorizeScoped, foundationErrors, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { DiscountRule } from '../data/entities'
import { discountRuleCreateSchema, discountRuleDeleteSchema, discountRuleUpdateSchema } from '../data/validators'
import {
  discountValueInvalid,
  normalizeConditions,
  type DiscountConditions,
  type DiscountKind,
} from '../lib/payments-rules'
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

export const DISCOUNT_RULE_RESOURCE_KIND = 'payments.discount_rule'

export const discountRuleEvents = paymentsEvents<DiscountRule>('discount_rule')

export type DiscountRuleSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  name: string
  kind: DiscountKind
  percent: number | null
  amount: number | null
  conditions: DiscountConditions
  validFrom: string
  validTo: string | null
}

export type DiscountRuleCommandResult = PaymentsCommandResult<DiscountRule, DiscountRuleSnapshot>

export function discountRuleSnapshot(row: DiscountRule): DiscountRuleSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    name: row.name,
    kind: row.kind,
    percent: row.percent ?? null,
    amount: row.amount ?? null,
    conditions: { ...row.conditions },
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}

function restoreRule(row: DiscountRule, before: DiscountRuleSnapshot): void {
  row.name = before.name
  row.percent = before.percent
  row.amount = before.amount
  row.conditions = { ...before.conditions }
  row.validFrom = before.validFrom
  row.validTo = before.validTo
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<DiscountRule | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(DiscountRule, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<DiscountRule | null>,
): AuthorizeScopedSpec<TSchema, DiscountRule> {
  return {
    input,
    resourceKind: DISCOUNT_RULE_RESOURCE_KIND,
    allowedKinds: PAYMENTS_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => clubTarget(entity as DiscountRule),
  }
}

async function authorizeRuleReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<DiscountRule> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] discount rule replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), loader(ctx, includeDeleted)),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as DiscountRule
}

/** The checked value and conditions of a rule, or a coded 422. */
async function checkedRule(
  kind: DiscountKind,
  value: { percent: number | null; amount: number | null },
  conditions: Partial<DiscountConditions> | null | undefined,
): Promise<DiscountConditions> {
  if (discountValueInvalid({ kind, ...value })) await paymentsErrors.throw('discount_value_invalid')
  const normalized = normalizeConditions(kind, conditions)
  if (!normalized) return paymentsErrors.throw('discount_conditions_invalid')
  return normalized
}

const createRuleCommand: CommandHandler<Record<string, unknown>, DiscountRuleCommandResult> = {
  id: 'payments.discount_rules.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'payments.discount_rules.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: discountRuleCreateSchema,
          resourceKind: DISCOUNT_RULE_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const value = { percent: parsed.percent ?? null, amount: parsed.amount ?? null }
      const conditions = await checkedRule(parsed.kind, value, parsed.conditions)
      const row = em.create(DiscountRule, {
        id,
        tenantId,
        organizationId,
        name: parsed.name,
        kind: parsed.kind,
        ...value,
        conditions,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo ?? null,
      })
      em.persist(row)
      await em.flush()
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'created', discountRuleEvents)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: DISCOUNT_RULE_RESOURCE_KIND,
      labelKey: 'payments.audit.discounts.create',
      fallback: 'Create a discount rule',
      after: discountRuleSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeRuleReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeRuleReplay(ctx, logEntry.resourceId)
    await undoCreate(ctx, row, discountRuleEvents)
  },
}

const updateRuleCommand: CommandHandler<Record<string, unknown>, DiscountRuleCommandResult> = {
  id: 'payments.discount_rules.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.discount_rules.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(discountRuleUpdateSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as DiscountRule
      const before = discountRuleSnapshot(row)
      const patch = authorized.parsed
      // Sending either value replaces both: a rule switches between a percent and an amount in one save.
      const valueSent = patch.percent !== undefined || patch.amount !== undefined
      const value = valueSent
        ? { percent: patch.percent ?? null, amount: patch.amount ?? null }
        : { percent: row.percent ?? null, amount: row.amount ?? null }
      const conditions = await checkedRule(row.kind, value, patch.conditions ?? row.conditions)
      const validFrom = patch.validFrom ?? row.validFrom
      const validTo = patch.validTo !== undefined ? patch.validTo : (row.validTo ?? null)
      if (isInvertedPeriod(validFrom, validTo)) await foundationErrors.throw('validity_inverted')
      row.name = patch.name ?? row.name
      row.percent = value.percent
      row.amount = value.amount
      row.conditions = conditions
      row.validFrom = validFrom
      row.validTo = validTo
      row.updatedAt = new Date()
      await em.flush()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'updated', discountRuleEvents)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: DISCOUNT_RULE_RESOURCE_KIND,
      labelKey: 'payments.audit.discounts.update',
      fallback: 'Change a discount rule',
      after: discountRuleSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeRuleReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as DiscountRuleSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing discount rule snapshot for undo')
    const row = await authorizeRuleReplay(ctx, before.id)
    await undoRestore(ctx, row, before, restoreRule, discountRuleEvents, 'updated')
  },
}

const deleteRuleCommand: CommandHandler<Record<string, unknown>, DiscountRuleCommandResult> = {
  id: 'payments.discount_rules.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.discount_rules.delete', async (em) => {
      const authorized = await authorizeScoped(existingSpec(discountRuleDeleteSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as DiscountRule
      const before = discountRuleSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'deleted', discountRuleEvents)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: DISCOUNT_RULE_RESOURCE_KIND,
      labelKey: 'payments.audit.discounts.delete',
      fallback: 'Delete a discount rule',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeRuleReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as DiscountRuleSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing discount rule snapshot for undo')
    const row = await authorizeRuleReplay(ctx, before.id, true)
    await undoRestore(ctx, row, before, restoreRule, discountRuleEvents, 'created')
  },
}

registerCommand(createRuleCommand)
registerCommand(updateRuleCommand)
registerCommand(deleteRuleCommand)
