// The `payments` season contributor (people life-cycle spec REQ-L08, DD-L10, the `SeasonContributor` row; phase L9,
// #311): `groups` declares the contract (`groups/services/season-rollover.ts`) and reads it with `hasRegistration`;
// `payments` registers it in `di.ts` under `groups.season.payments`. The candidates are the live fees of the plan's
// groups — a fee of the group or of one of its activities — that run past the old season's last day. `end` sets
// `valid_to` to the last day; `end_and_copy` also creates a copy valid from the new season's first day with the new
// name, amount or payment day the plan gives (open-ended when the original was, else to the new season's last day); a
// fee of a copied activity points at the copy. Charges already issued keep their amounts. Fees are written by the club
// administrator only (`PAYMENTS_WRITE_KINDS`): for any other actor (a coordinator) the contributor offers no fee and
// changes none, and the preview says so. Writes run in the caller's transaction; `payments.fee.*` after the commit.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { z } from 'zod'
import { findActingRole } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import type {
  SeasonChange,
  SeasonContributor,
  SeasonPreviewItem,
  SeasonRolloverContext,
  SeasonRolloverPlan,
} from '../../groups/services/season-rollover'
import { feeEvents } from '../commands/fees'
import { PAYMENTS_WRITE_KINDS, clubTarget } from '../commands/shared'
import { Fee } from '../data/entities'
import { findActivities, type PaymentsScope } from './directory'
import type { ScheduleActivityEntry } from '../../activities/services/schedule-directory'

/** The token `groups` reads (`seasonContributorToken('payments')` in `groups/services/season-rollover.ts`). */
export const PAYMENTS_SEASON_CONTRIBUTOR = 'groups.season.payments'

/** The values a fee copy may change; the amount in grosz (as the fee form sends it). */
const copySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    amount: z.number().int().min(1).max(100_000_000).optional(),
    dueDay: z.number().int().min(1).max(28).optional(),
  })
  .strict()

type CopyValues = z.output<typeof copySchema>

function scopeOf(plan: SeasonRolloverPlan): PaymentsScope {
  return { tenantId: plan.tenantId, organizationId: plan.organizationId }
}

/** Whether the actor writes fees (the club administrator); a coordinator's rollover leaves the fees alone. */
async function writesFees(plan: SeasonRolloverPlan, ctx: SeasonRolloverContext): Promise<boolean> {
  const grants = await scopeContract.resolve(ctx.command)
  const target = clubTarget({ id: plan.organizationId, ...scopeOf(plan) })
  return findActingRole(grants, PAYMENTS_WRITE_KINDS, target) !== null
}

/** The live fees of the plan's groups running past the last day, each with the group it belongs to. */
async function candidateFees(
  em: EntityManager,
  plan: SeasonRolloverPlan,
  ctx: SeasonRolloverContext,
): Promise<Array<{ fee: Fee; groupId: string }>> {
  const groupIds = new Set(plan.groups.map((group) => group.groupId))
  if (groupIds.size === 0) return []
  const rows = (
    await em.find(
      Fee,
      {
        ...scopeOf(plan),
        deletedAt: null,
        validFrom: { $lte: plan.lastDay },
        $or: [{ groupId: { $in: [...groupIds] } }, { activityId: { $ne: null } }],
      },
      { orderBy: { name: 'asc', id: 'asc' } },
    )
  ).filter((row) => ctx.rules.runsPast({ validTo: row.validTo ?? null }, plan.lastDay))
  const activityIds = [...new Set(rows.flatMap((row) => (row.activityId ? [row.activityId] : [])))]
  const activities =
    activityIds.length > 0
      ? await findActivities(ctx.container, scopeOf(plan), activityIds, em)
      : new Map<string, ScheduleActivityEntry>()
  return rows.flatMap((fee) => {
    const groupId = fee.groupId ?? (fee.activityId ? activities.get(fee.activityId)?.groupId : undefined)
    return groupId && groupIds.has(groupId) ? [{ fee, groupId }] : []
  })
}

async function copyValues(
  plan: SeasonRolloverPlan,
  recordId: string,
  rules: SeasonRolloverContext['rules'],
): Promise<CopyValues> {
  const parsed = copySchema.safeParse(plan.records[recordId]?.copy ?? {})
  if (parsed.success) return parsed.data
  const key = parsed.error.issues[0]?.path[0]
  return rules.copyInvalid(`records.${recordId}.copy${typeof key === 'string' ? `.${key}` : ''}`)
}

/**
 * A copy of a fee of an activity needs the activity to go on: kept (the copy names it) or copied (the copy names the
 * copy). An activity that only ends leaves the fee copy without a target: 422 `rollover_copy_invalid`.
 */
async function assertCopyTarget(
  plan: SeasonRolloverPlan,
  fee: Fee,
  groupId: string,
  rules: SeasonRolloverContext['rules'],
): Promise<void> {
  if (!fee.activityId) return
  const activityAction = rules.recordAction(plan, groupId, fee.activityId)
  if (activityAction === 'end') await rules.copyInvalid(`records.${fee.id}.activityId`)
}

export const seasonContribution: SeasonContributor = {
  async preview(em, plan, ctx) {
    const moving = plan.groups.filter((group) => group.action !== 'none')
    if (!(await writesFees(plan, ctx))) {
      return {
        candidates: [],
        items: [],
        conflicts: [],
        notices: moving.length > 0 ? [{ module: 'payments', code: 'fees_unchanged' }] : [],
      }
    }
    const rows = await candidateFees(em, plan, ctx)
    const items: SeasonPreviewItem[] = []
    for (const { fee, groupId } of rows) {
      const action = ctx.rules.recordAction(plan, groupId, fee.id)
      if (action === null || action === 'keep') continue
      items.push({
        module: 'payments',
        kind: 'fee',
        recordId: fee.id,
        groupId,
        action: 'end',
        label: { name: fee.name, amount: fee.amount, until: plan.lastDay },
      })
      if (action !== 'end_and_copy') continue
      const values = await copyValues(plan, fee.id, ctx.rules)
      await assertCopyTarget(plan, fee, groupId, ctx.rules)
      items.push({
        module: 'payments',
        kind: 'fee',
        recordId: null,
        groupId,
        action: 'create',
        label: {
          name: values.name ?? fee.name,
          amount: values.amount ?? fee.amount,
          period: fee.period,
          dueDay: values.dueDay ?? fee.dueDay,
          validFrom: plan.toSeason.startsOn,
          validTo: ctx.rules.copyEndsOn(fee.validTo ?? null, plan.toSeason.endsOn),
        },
      })
    }
    return {
      candidates: rows.map(({ fee, groupId }) => ({
        module: 'payments' as const,
        kind: 'fee',
        recordId: fee.id,
        groupId,
        version: fee.updatedAt.toISOString(),
        label: {
          name: fee.name,
          amount: fee.amount,
          period: fee.period,
          dueDay: fee.dueDay,
          activityId: fee.activityId ?? null,
          validFrom: fee.validFrom,
          validTo: fee.validTo ?? null,
        },
      })),
      items,
      conflicts: [],
      notices: [],
    }
  },

  async apply(em, plan, ctx, copies) {
    const changes: SeasonChange[] = []
    const created: Record<string, string> = {}
    if (!(await writesFees(plan, ctx))) return { changes, copies: created }
    for (const { fee, groupId } of await candidateFees(em, plan, ctx)) {
      const action = ctx.rules.recordAction(plan, groupId, fee.id)
      if (action === null || action === 'keep') continue
      const values = action === 'end_and_copy' ? await copyValues(plan, fee.id, ctx.rules) : null
      if (values) await assertCopyTarget(plan, fee, groupId, ctx.rules)
      const validTo = fee.validTo ?? null
      fee.validTo = plan.lastDay
      fee.updatedAt = new Date()
      changes.push({ kind: 'fee', recordId: fee.id, action: 'updated' })
      if (!values) continue
      const id = randomUUID()
      em.persist(
        em.create(Fee, {
          id,
          ...scopeOf(plan),
          name: values.name ?? fee.name,
          amount: values.amount ?? fee.amount,
          period: fee.period,
          groupId: fee.groupId ?? null,
          activityId: fee.activityId ? (copies[fee.activityId] ?? fee.activityId) : null,
          dueDay: values.dueDay ?? fee.dueDay,
          validFrom: plan.toSeason.startsOn,
          validTo: ctx.rules.copyEndsOn(validTo, plan.toSeason.endsOn),
        }),
      )
      changes.push({ kind: 'fee', recordId: id, action: 'created' })
      created[fee.id] = id
    }
    await em.flush()
    return { changes, copies: created }
  },

  async afterCommit(changes, ctx) {
    const ids = changes.filter((change) => change.kind === 'fee').map((change) => change.recordId)
    if (ids.length === 0) return
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const rows = await em.find(Fee, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, id: { $in: ids } })
    const dataEngine = ctx.container.resolve<DataEngine>('dataEngine')
    for (const row of rows) {
      const change = changes.find((entry) => entry.recordId === row.id) as SeasonChange
      await emitCrudSideEffects({
        dataEngine,
        action: change.action,
        entity: row,
        identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
        events: feeEvents,
      })
    }
  },
}
