// The coach's writes of "My groups' payments", phase 4 step 10, the coach part (payments spec API rows
// `/api/payments/group-charges*`, `/orders/{id}/hand-over`; DD-31, DD-32; REQ-033, TEST-045; issue #117 E07-S10; UX
// concept M-18). Each acts on a child of one of the caller's groups — the coach's group, any group of a coordinator's
// section, any group for the club administrator — and only on that group's charges (`childGroupCharges`):
// - `payments.cash.collect` accepts cash for several of the child's charges at once: one `KP/YYYY/MM/NNN` receipt
//   (`acceptCashOnCharges`, shared with "Accept cash"), the amount paid oldest first, an e-mail to each payer; the cash
//   is held by the collector until the treasurer's handover (E07-S11, #118). A membership fee only with the club's
//   `coach_fee_access = collect` (403 `coach_fee_cash_disabled`), never a charge without a payer (422
//   `charge_payer_missing`);
// - `payments.group_charges.remind` ("Send reminder") e-mails each payer of the child's overdue charges their list;
// - `payments.orders.hand_over` ("Hand over kit") marks a kit handed over after the delivery (409
//   `order_not_delivered`, `order_already_handed_over`; an unpaid kit only with `confirmUnpaid`, else 409
//   `order_unpaid_confirm_required`; the charge stays open).
// A child or charge outside the group answers 403 `charge_out_of_scope`; a group outside the caller's grants 403
// `scope_denied`. None is undoable: money is corrected with a reversing entry, a reminder is an e-mail already sent and a
// handover is a real-world event. Each is audited.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { GrantKind, Recipient } from '@vereino/core'
import { authorizeScoped, contactResolver, type DispatchService } from '@/modules/foundation'
import type { GroupDirectoryEntry } from '../../groups/services/group-directory'
import { paymentsErrors } from '../api/errors'
import { Charge, Order, OrderCampaign, Payment } from '../data/entities'
import { groupCashSchema, groupRemindSchema, orderHandOverSchema } from '../data/validators'
import type { ChargeReminderParams } from '../emails/templates'
import { amountDueOf, paidTotal, remainingOf } from '../lib/charge-ledger'
import { coachCashRefusal, handOverRefusal, overdueByPayer } from '../lib/group-charges'
import { clubClock, findGroups, findPersons, type PaymentsScope } from '../services/directory'
import { childGroupCharges, feeAccessFor, groupParticipants } from '../services/group-charges'
import { acceptCashOnCharges, afterCashCommit, enqueueConfirmation, selfPersonId, type CashPaymentLine } from './cash'
import { PAYMENT_RESOURCE_KIND } from './ledger'
import { ORDER_RESOURCE_KIND } from './orders'
import { emitAfterCommit, inWriteTransaction, paymentsLog, trustedTenantId, type PaymentsCommandResult } from './shared'

/** The grants of "My groups' payments", least-privileged first (DD-F08). */
export const GROUP_CHARGE_KINDS: readonly GrantKind[] = ['coach', 'coordinator', 'club_admin']

type ScopedRef = { id: string; tenantId: string; organizationId: string }

/** The group of the input, read in the caller's trusted club; null answers 404. */
function groupLoader(ctx: CommandRuntimeContext) {
  return async (em: EntityManager, groupId: string): Promise<GroupDirectoryEntry | null> => {
    const tenantId = trustedTenantId(ctx)
    const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
    if (!tenantId || !organizationId) return null
    return (await findGroups(ctx.container, { tenantId, organizationId }, [groupId], em)).get(groupId) ?? null
  }
}

/**
 * Authorizes a group write: the group must be within the caller's grants (403 `scope_denied`) and the child one of
 * its participants today (403 `charge_out_of_scope`).
 */
async function authorizeGroupChild<TSchema extends typeof groupCashSchema | typeof groupRemindSchema>(
  schema: TSchema,
  rawInput: unknown,
  ctx: CommandRuntimeContext,
  em: EntityManager,
) {
  const authorized = await authorizeScoped(
    {
      input: schema,
      resourceKind: PAYMENT_RESOURCE_KIND,
      allowedKinds: GROUP_CHARGE_KINDS,
      loadTarget: (parsed, lockEm) => groupLoader(ctx)(lockEm, (parsed as z.output<TSchema>).groupId),
      resolveTarget: (_parsed, group, scope) => {
        const row = group as GroupDirectoryEntry
        return { id: row.id, ...scope, groupId: row.id, sectionId: row.sectionId }
      },
      // The group is not edited, so no lock token.
      lock: 'none',
    },
    rawInput,
    ctx,
    em,
  )
  const parsed = authorized.parsed as z.output<TSchema>
  const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
  const { today } = await clubClock(ctx.container, scope)
  const children = await groupParticipants(ctx.container, scope, parsed.groupId, today, em)
  if (!children.includes(parsed.participantPersonId)) await paymentsErrors.throw('charge_out_of_scope')
  const { access } = await feeAccessFor(ctx.container, scope, authorized.scope)
  const charges = await childGroupCharges(ctx.container, em, scope, {
    groupId: parsed.groupId,
    personId: parsed.participantPersonId,
    access,
    today,
  })
  return { authorized, parsed, scope, today, access, charges }
}

// --- payments.cash.collect ---

export type GroupCashResult = PaymentsCommandResult<Payment, null> & {
  receiptNumber: string
  participantPersonId: string
  groupId: string
  payerPersonIds: string[]
  amount: number
  paidOn: string
  payments: CashPaymentLine[]
  dispatchIds: string[]
  scope: PaymentsScope
}

const collectCashCommand: CommandHandler<Record<string, unknown>, GroupCashResult> = {
  id: 'payments.cash.collect',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.cash.collect', async (em) => {
      const {
        authorized,
        parsed,
        scope,
        access,
        charges: shown,
      } = await authorizeGroupChild(groupCashSchema, rawInput, ctx, em)
      const byId = new Map(shown.map((charge) => [charge.id, charge]))
      for (const id of parsed.chargeIds) {
        const charge = byId.get(id)
        if (!charge) return paymentsErrors.throw('charge_out_of_scope')
        const refusal = coachCashRefusal(charge, access)
        if (refusal) return paymentsErrors.throw(refusal)
      }
      // Row locks in id order, as "Accept cash" takes them, so two acceptances that share charges never deadlock.
      const locked = await em.find(
        Charge,
        { id: { $in: parsed.chargeIds }, ...scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
      )
      const collectorPersonId = selfPersonId(authorized.scope)
      const { receiptNumber, lines, created } = await acceptCashOnCharges(ctx, em, scope, locked, {
        amount: parsed.amount,
        paidOn: parsed.paidOn,
        collectorPersonId,
      })
      const payerOf = new Map(locked.map((charge) => [charge.id, charge.payerPersonId as string]))
      const payerPersonIds = [...new Set(lines.map((line) => payerOf.get(line.chargeId) as string))]
      const dispatchIds: string[] = []
      if (parsed.notify) {
        for (const payerPersonId of payerPersonIds) {
          const payerLines = lines.filter((line) => payerOf.get(line.chargeId) === payerPersonId)
          const dispatchId = await enqueueConfirmation({
            ctx,
            em,
            scope,
            grants: authorized.scope,
            actingRole: authorized.actingRole,
            payerPersonId,
            collectorPersonId,
            params: {
              receiptNumber,
              amount: payerLines.reduce((sum, line) => sum + line.amount, 0),
              paidOn: parsed.paidOn,
            },
            lines: payerLines,
            idempotencyKey: `payments:cash:${receiptNumber}:${payerPersonId}`,
          })
          if (dispatchId) dispatchIds.push(dispatchId)
        }
      }
      return {
        entity: created[0],
        actingRole: authorized.actingRole,
        before: null,
        receiptNumber,
        participantPersonId: parsed.participantPersonId,
        groupId: parsed.groupId,
        payerPersonIds,
        amount: parsed.amount,
        paidOn: parsed.paidOn,
        payments: lines,
        dispatchIds,
        scope,
      }
    })
    await afterCashCommit(ctx, result, result.scope)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: PAYMENT_RESOURCE_KIND,
      labelKey: 'payments.audit.cash.collect',
      fallback: "Accept cash for my group's charges",
      after: {
        receiptNumber: result.receiptNumber,
        participantPersonId: result.participantPersonId,
        groupId: result.groupId,
        payerPersonIds: result.payerPersonIds,
        amount: result.amount,
        paidOn: result.paidOn,
        payments: result.payments.map((line) => ({
          id: line.paymentId,
          chargeId: line.chargeId,
          amount: line.amount,
          chargeStatus: line.chargeStatus,
        })),
      },
      context: { receiptNumber: result.receiptNumber, notified: result.dispatchIds.length },
    }),
}

// --- payments.group_charges.remind ---

export type GroupRemindResult = PaymentsCommandResult<ScopedRef, null> & {
  groupId: string
  charges: number
  recipients: number
  dispatchIds: string[]
  scope: PaymentsScope
}

const remindGroupChargesCommand: CommandHandler<Record<string, unknown>, GroupRemindResult> = {
  id: 'payments.group_charges.remind',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.group_charges.remind', async (em) => {
      const { authorized, parsed, scope, charges } = await authorizeGroupChild(groupRemindSchema, rawInput, ctx, em)
      const byPayer = overdueByPayer(charges)
      const child = (await findPersons(ctx.container, scope, [parsed.participantPersonId], em)).get(
        parsed.participantPersonId,
      )
      const childName = child ? `${child.firstName} ${child.lastName}` : ''
      const resolverCtx = { container: ctx.container, ...scope, scope: authorized.scope, em }
      const contacts =
        byPayer.size > 0 ? await contactResolver(ctx.container).contacts([...byPayer.keys()], resolverCtx) : []
      const dispatchIds: string[] = []
      let overdue = 0
      for (const [payerPersonId, payerCharges] of byPayer) {
        overdue += payerCharges.length
        const contact = contacts.find((row) => row.personId === payerPersonId)
        if (!contact?.email) continue
        const recipient: Recipient = {
          personId: contact.personId,
          userId: contact.userId,
          email: contact.email,
          locale: contact.locale,
          reasons: ['direct'],
          channels: ['email'],
        }
        const params: ChargeReminderParams = {
          childName,
          lines: payerCharges.map((charge) => ({
            description: charge.description,
            remaining: charge.remaining,
            dueDate: charge.dueDate,
          })),
          total: payerCharges.reduce((sum, charge) => sum + charge.remaining, 0),
        }
        const { dispatchId } = await ctx.container.resolve<DispatchService>('foundationDispatch').enqueue(
          em,
          {
            template: 'payments.charge_reminder',
            params,
            recipients: [recipient],
            source: { module: 'payments', type: 'payments:charge', id: payerCharges[0].id },
            // Each "Send reminder" is its own send.
            idempotencyKey: `payments:charge-reminder:${parsed.participantPersonId}:${payerPersonId}:${randomUUID()}`,
            actor: { userId: ctx.auth?.sub ?? null, actingRole: authorized.actingRole },
          },
          { ...scope, scope: authorized.scope, em },
        )
        dispatchIds.push(dispatchId)
      }
      return {
        entity: { id: parsed.participantPersonId, ...scope },
        actingRole: authorized.actingRole,
        before: null,
        groupId: parsed.groupId,
        charges: overdue,
        recipients: dispatchIds.length,
        dispatchIds,
        scope,
      }
    })
    for (const dispatchId of result.dispatchIds) {
      await ctx.container.resolve<DispatchService>('foundationDispatch').publish(dispatchId, result.scope)
    }
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: PAYMENT_RESOURCE_KIND,
      labelKey: 'payments.audit.groupCharges.remind',
      fallback: 'Remind payers of overdue charges',
      after: null,
      context: { groupId: result.groupId, charges: result.charges, recipients: result.recipients },
    }),
}

// --- payments.orders.hand_over ---

type HandOverTarget = { order: Order; campaign: OrderCampaign; updatedAt: Date }

export type OrderHandOverResult = PaymentsCommandResult<Order, { handedOverAt: null }> & {
  campaignId: string
  remaining: number
  scope: PaymentsScope
}

const handOverOrderCommand: CommandHandler<Record<string, unknown>, OrderHandOverResult> = {
  id: 'payments.orders.hand_over',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.orders.hand_over', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: orderHandOverSchema,
          resourceKind: ORDER_RESOURCE_KIND,
          allowedKinds: GROUP_CHARGE_KINDS,
          loadTarget: async (parsed, lockEm, lock): Promise<HandOverTarget | null> => {
            const tenantId = trustedTenantId(ctx)
            if (!tenantId) return null
            const order = await lockEm.findOne(Order, { id: parsed.id, tenantId, deletedAt: null }, lock)
            if (!order || order.status !== 'submitted') return null
            const campaign = await lockEm.findOne(OrderCampaign, {
              id: order.campaignId,
              tenantId,
              organizationId: order.organizationId,
              deletedAt: null,
            })
            return campaign ? { order, campaign, updatedAt: order.updatedAt } : null
          },
          resolveTarget: (parsed, entity) => {
            const { order, campaign } = entity as HandOverTarget
            return {
              id: order.id,
              tenantId: order.tenantId,
              organizationId: order.organizationId,
              sectionId: campaign.sectionId,
              groupId: campaign.groupIds.includes(parsed.groupId) ? parsed.groupId : null,
            }
          },
          // Refused twice by `order_already_handed_over`, so it needs no lock token.
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
      )
      const { order, campaign } = authorized.entity as HandOverTarget
      const { parsed } = authorized
      const scope = { tenantId: order.tenantId, organizationId: order.organizationId }
      const { today } = await clubClock(ctx.container, scope)
      if (
        !campaign.groupIds.includes(parsed.groupId) ||
        !(await groupParticipants(ctx.container, scope, parsed.groupId, today, em)).includes(order.participantPersonId)
      ) {
        await paymentsErrors.throw('charge_out_of_scope')
      }
      const charge = await em.findOne(Charge, { id: order.chargeId, ...scope, deletedAt: null })
      const ledger = await em.find(Payment, {
        chargeId: order.chargeId,
        ...scope,
        isOverpayment: false,
        deletedAt: null,
      })
      const remaining = charge ? remainingOf(amountDueOf(charge), paidTotal(ledger)) : 0
      const refusal = handOverRefusal({
        campaignStatus: campaign.status,
        handedOver: !!order.handedOverAt,
        remaining,
        confirmUnpaid: parsed.confirmUnpaid,
      })
      if (refusal) await paymentsErrors.throw(refusal, refusal === 'order_unpaid_confirm_required' ? { remaining } : {})
      const now = new Date()
      order.handedOverAt = now
      order.handedOverByPersonId = selfPersonId(authorized.scope)
      order.updatedAt = now
      await em.flush()
      return {
        entity: order,
        actingRole: authorized.actingRole,
        before: { handedOverAt: null },
        campaignId: campaign.id,
        remaining,
        scope,
      }
    })
    await emitAfterCommit('payments.order.handed_over', result.scope, {
      id: result.entity.id,
      campaignId: result.campaignId,
      chargeId: result.entity.chargeId,
      unpaid: result.remaining > 0,
    })
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: ORDER_RESOURCE_KIND,
      labelKey: 'payments.audit.orders.handOver',
      fallback: 'Hand over kit',
      after: {
        handedOverAt: result.entity.handedOverAt?.toISOString() ?? null,
        handedOverByPersonId: result.entity.handedOverByPersonId ?? null,
      },
      context: { campaignId: result.campaignId, unpaid: result.remaining > 0 },
    }),
}

registerCommand(collectCashCommand)
registerCommand(remindGroupChargesCommand)
registerCommand(handOverOrderCommand)
