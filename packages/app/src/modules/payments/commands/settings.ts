// `payments.settings.update` (payments spec *Data Models* → `payments_settings`; R07, DD-32; B-20 "Coaches and
// payments"; issue #108): a partial update of the club's payment settings by the club administrator. `execute` creates
// the row with its defaults on the first update, row-locks it and authorizes inside one write transaction; undo
// writes the previous values back after `authorizeReplay` re-checks the scope.
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec } from '@/modules/foundation'
import { PaymentsSettings } from '../data/entities'
import { ensurePaymentsSettingsRow } from '../data/queries'
import { paymentsSettingsUpdateSchema } from '../data/validators'
import type { CoachFeeAccess } from '../lib/payments-rules'
import {
  PAYMENTS_WRITE_KINDS,
  emitPaymentsSideEffects,
  inWriteTransaction,
  paymentsEvents,
  paymentsLog,
  type PaymentsCommandResult,
} from './shared'

export const PAYMENTS_SETTINGS_RESOURCE_KIND = 'payments.settings'

export const paymentsSettingsEvents = paymentsEvents<PaymentsSettings>('settings')

export type PaymentsSettingsSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  coachFeeAccess: CoachFeeAccess
  autoBookBankMatches: boolean
}

export type PaymentsSettingsCommandResult = PaymentsCommandResult<PaymentsSettings, PaymentsSettingsSnapshot>

export function paymentsSettingsSnapshot(row: PaymentsSettings): PaymentsSettingsSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    coachFeeAccess: row.coachFeeAccess,
    autoBookBankMatches: row.autoBookBankMatches,
  }
}

/** True for the row the first update created with its defaults: nobody could have read a version of it. */
function untouchedSinceCreated(row: { createdAt: Date; updatedAt: Date }): boolean {
  return row.createdAt.getTime() === row.updatedAt.getTime()
}

function settingsSpec<TSchema extends z.ZodType<Record<string, unknown>>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
): AuthorizeScopedSpec<TSchema, PaymentsSettings> {
  const trusted = trustedScopeOf(ctx)
  return {
    input,
    resourceKind: PAYMENTS_SETTINGS_RESOURCE_KIND,
    allowedKinds: PAYMENTS_WRITE_KINDS,
    loadTarget: (_parsed, em, lock) =>
      trusted ? em.findOne(PaymentsSettings, { ...trusted, deletedAt: null }, lock) : Promise.resolve(null),
    acceptsMissingToken: untouchedSinceCreated,
    resolveTarget: (_parsed, entity, scope) => ({
      id: entity?.id ?? scope.organizationId,
      tenantId: entity?.tenantId ?? scope.tenantId,
      organizationId: entity?.organizationId ?? scope.organizationId,
    }),
  }
}

async function authorizeSettingsReplay(ctx: CommandRuntimeContext): Promise<PaymentsSettings> {
  const em = ctx.transactionalEm
  if (!em) throw new Error('[internal] payment settings replay needs the replay transaction')
  const { entity } = await authorizeScoped(settingsSpec(z.object({}).loose(), ctx), {}, ctx, em, { mode: 'replay' })
  if (!entity) throw new Error('[internal] payment settings row missing on replay')
  return entity
}

const updatePaymentsSettingsCommand: CommandHandler<Record<string, unknown>, PaymentsSettingsCommandResult> = {
  id: 'payments.settings.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.settings.update', async (em: EntityManager) => {
      const trusted = trustedScopeOf(ctx)
      if (trusted) await ensurePaymentsSettingsRow(em, trusted)
      const authorized = await authorizeScoped(settingsSpec(paymentsSettingsUpdateSchema, ctx), rawInput, ctx, em)
      const row = authorized.entity
      if (!row) throw new Error('[internal] payment settings row missing after ensure')
      const before = paymentsSettingsSnapshot(row)
      const patch = authorized.parsed
      if (patch.coachFeeAccess !== undefined) row.coachFeeAccess = patch.coachFeeAccess
      if (patch.autoBookBankMatches !== undefined) row.autoBookBankMatches = patch.autoBookBankMatches
      row.updatedAt = new Date()
      await em.flush()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'updated', paymentsSettingsEvents)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: PAYMENTS_SETTINGS_RESOURCE_KIND,
      labelKey: 'payments.audit.settings.update',
      fallback: 'Change the payment settings',
      after: paymentsSettingsSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx }) {
    await authorizeSettingsReplay(ctx)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as PaymentsSettingsSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing payment settings snapshot for undo')
    const row = await authorizeSettingsReplay(ctx)
    row.coachFeeAccess = before.coachFeeAccess
    row.autoBookBankMatches = before.autoBookBankMatches
    row.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitPaymentsSideEffects(ctx, row, 'updated', paymentsSettingsEvents, true)
  },
}

registerCommand(updatePaymentsSettingsCommand)
