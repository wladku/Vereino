// `groups.memberships.create|update|end|delete` (club spec glossary *Membership*; TEST-030; #30 criteria 1–2; parity
// spec REQ-A03, #267): a person's membership of a group as `participant`, `coach` or `assistant` for a period. A
// coordinator writes the memberships of the groups of their sections, the club administrator every membership. A
// membership is ended through `valid_to`, so the roster keeps its history; only a mistake is removed (a soft delete):
// one that has not started, or a started one `activities` reports as never used (409 `membership_in_use`). Every
// write takes the group's row lock first and then refuses an overlapping live membership of the same person, group and
// role (409 `membership_overlap`), so two concurrent writes cannot both pass; the partial unique index on open-ended
// memberships backs the check. The person is a live `people` person of the club (422 `groups_reference_invalid`). Every change emits `groups.membership.*`, on which the
// `groups:sync-member-roles` subscriber recomputes the person's `auth` roles (an adult participant is a payer).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { isInvertedPeriod, type Scope } from '@vereino/core'
import {
  assertInScope,
  authorizeScoped,
  foundationErrors,
  type AuthorizeScopedSpec,
  type TargetLock,
} from '@/modules/foundation'
import { groupsErrors } from '../api/errors'
import { type Group, GroupMembership } from '../data/entities'
import {
  membershipCreateSchema,
  membershipDeleteSchema,
  membershipEndSchema,
  membershipMoveSchema,
  membershipUpdateSchema,
} from '../data/validators'
import { endRefused, firstOverlapping, mayRemoveMembership, planMove, type MembershipRole } from '../lib/groups-rules'
import { clubToday } from '../services/club-clock'
import { findPersons } from '../services/directory'
import { groupUsageContract } from '../services/group-usage'
import {
  GROUP_WRITE_KINDS,
  emitGroupsSideEffects,
  groupTarget,
  groupsLog,
  inWriteTransaction,
  isUniqueViolation,
  loadGroupLocked,
  lockGroup,
  membershipEvents,
  membershipTarget,
  trustedTenantId,
  type GroupsCommandResult,
  type GroupsScope,
} from './shared'

export const MEMBERSHIP_RESOURCE_KIND = 'groups.membership'

export type MembershipSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  groupId: string
  personId: string
  role: MembershipRole
  validFrom: string
  validTo: string | null
}

export type MembershipCommandResult = GroupsCommandResult<GroupMembership, MembershipSnapshot>

export function membershipSnapshot(row: GroupMembership): MembershipSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    groupId: row.groupId,
    personId: row.personId,
    role: row.role,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }
}

/**
 * A membership with its group, both row-locked: the membership first, then its group (a create locks only the group,
 * so the order cannot deadlock). The group's row lock serializes the overlap check of every membership write of the
 * group. `updatedAt` is the membership's lock token, which `authorizeScoped` compares.
 */
type LockedMembership = { membership: GroupMembership; group: Group; updatedAt: Date }

async function loadMembershipLocked(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  id: string,
  lock: TargetLock,
  includeDeleted = false,
): Promise<LockedMembership | null> {
  const tenantId = trustedTenantId(ctx)
  if (!tenantId) return null
  const membership = await em.findOne(
    GroupMembership,
    { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) },
    lock,
  )
  if (!membership) return null
  const group = await lockGroup(
    em,
    { tenantId: membership.tenantId, organizationId: membership.organizationId },
    membership.groupId,
  )
  return group ? { membership, group, updatedAt: membership.updatedAt } : null
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
  includeDeleted = false,
): AuthorizeScopedSpec<TSchema, LockedMembership> {
  return {
    input,
    resourceKind: MEMBERSHIP_RESOURCE_KIND,
    allowedKinds: GROUP_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => loadMembershipLocked(em, ctx, parsed.id, lock, includeDeleted),
    resolveTarget: (_parsed, entity) => {
      const loaded = entity as LockedMembership
      return membershipTarget(loaded.membership.id, loaded.group)
    },
  }
}

async function authorizeMembershipReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<{ membership: GroupMembership; scope: Scope }> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] membership replay needs the replay transaction and the id')
  const spec = existingSpec(z.object({ id: z.uuid() }), ctx, includeDeleted)
  const authorized = await authorizeScoped(spec, { id }, ctx, em, {
    mode: 'replay',
  })
  return { membership: (authorized.entity as LockedMembership).membership, scope: authorized.scope }
}

type MembershipKey = GroupsScope & { groupId: string; personId: string; role: MembershipRole }

/**
 * 409 `membership_overlap` when another live membership of the same person, group and role overlaps the period. The
 * caller holds the group's row lock.
 */
async function assertNoOverlap(
  em: EntityManager,
  key: MembershipKey,
  period: { validFrom: string; validTo: string | null },
  exceptId: string | null,
): Promise<void> {
  const others = await em.find(
    GroupMembership,
    {
      tenantId: key.tenantId,
      organizationId: key.organizationId,
      groupId: key.groupId,
      personId: key.personId,
      role: key.role,
      deletedAt: null,
      ...(exceptId ? { id: { $ne: exceptId } } : {}),
    },
    { fields: ['id', 'validFrom', 'validTo'] },
  )
  const periods = others.map((row) => ({ id: row.id, validFrom: row.validFrom, validTo: row.validTo ?? null }))
  const conflict = firstOverlapping(period, periods)
  if (conflict) await groupsErrors.throw('membership_overlap', { membershipId: conflict.id })
}

/** Flushes and maps the open-ended partial unique index to the same 409 as the overlap check. */
async function flushMembership(em: EntityManager): Promise<void> {
  try {
    await em.flush()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) await groupsErrors.throw('membership_overlap')
    throw error
  }
}

async function buildMembershipLog(result: MembershipCommandResult, labelKey: string, fallback: string) {
  return groupsLog({
    result,
    resourceKind: MEMBERSHIP_RESOURCE_KIND,
    labelKey,
    fallback,
    after: membershipSnapshot(result.entity),
    parent: { resourceKind: 'groups.group', resourceId: result.entity.groupId },
  })
}

/**
 * Undo of an update, an end or a remove: restores the previous role and period (and a removed row), refusing a restore
 * that would overlap a membership written since.
 */
async function restoreMembership(
  ctx: CommandRuntimeContext,
  before: MembershipSnapshot | null | undefined,
  removed = false,
) {
  if (!before?.id) throw new Error('[internal] missing membership snapshot for undo')
  const { membership: row } = await authorizeMembershipReplay(ctx, before.id, removed)
  const em = ctx.transactionalEm as EntityManager
  const key = {
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    groupId: row.groupId,
    personId: row.personId,
    role: before.role,
  }
  await assertNoOverlap(em, key, { validFrom: before.validFrom, validTo: before.validTo }, row.id)
  row.role = before.role
  row.validFrom = before.validFrom
  row.validTo = before.validTo
  row.deletedAt = null
  row.updatedAt = new Date()
  await flushMembership(em)
  await emitGroupsSideEffects(ctx, row, removed ? 'created' : 'updated', membershipEvents, true)
}

const createMembershipCommand: CommandHandler<Record<string, unknown>, MembershipCommandResult> = {
  id: 'groups.memberships.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'groups.memberships.create', async (em) => {
      // The group is the scope target of a new membership; `loadTarget` row-locks it (no lock token: the group
      // itself is not changed).
      const authorized = await authorizeScoped(
        {
          input: membershipCreateSchema,
          resourceKind: MEMBERSHIP_RESOURCE_KIND,
          allowedKinds: GROUP_WRITE_KINDS,
          loadTarget: (parsed, txEm, lock) => loadGroupLocked(txEm, ctx, parsed.groupId, lock),
          resolveTarget: (_parsed, entity) => membershipTarget(id, entity as Group),
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const persons = await findPersons(ctx.container, scope, [parsed.personId], em)
      if (!persons.has(parsed.personId)) await groupsErrors.throw('groups_reference_invalid', { field: 'personId' })
      const key = { ...scope, groupId: parsed.groupId, personId: parsed.personId, role: parsed.role }
      const period = { validFrom: parsed.validFrom, validTo: parsed.validTo ?? null }
      await assertNoOverlap(em, key, period, null)
      const row = em.create(GroupMembership, {
        id,
        tenantId,
        organizationId,
        groupId: parsed.groupId,
        personId: parsed.personId,
        role: parsed.role,
        validFrom: period.validFrom,
        validTo: period.validTo,
      })
      em.persist(row)
      await flushMembership(em)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'created', membershipEvents)
    return result
  },
  buildLog: ({ result }) => buildMembershipLog(result, 'groups.audit.memberships.create', 'Add a group membership'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeMembershipReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const { membership: row } = await authorizeMembershipReplay(ctx, logEntry.resourceId)
    row.deletedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitGroupsSideEffects(ctx, row, 'deleted', membershipEvents, true)
  },
}

const updateMembershipCommand: CommandHandler<Record<string, unknown>, MembershipCommandResult> = {
  id: 'groups.memberships.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.memberships.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(membershipUpdateSchema, ctx), rawInput, ctx, em)
      const row = (authorized.entity as LockedMembership).membership
      const before = membershipSnapshot(row)
      const patch = authorized.parsed
      const role = patch.role ?? row.role
      const validFrom = patch.validFrom ?? row.validFrom
      const validTo = patch.validTo !== undefined ? patch.validTo : (row.validTo ?? null)
      if (isInvertedPeriod(validFrom, validTo)) await foundationErrors.throw('validity_inverted')
      const key = {
        tenantId: row.tenantId,
        organizationId: row.organizationId,
        groupId: row.groupId,
        personId: row.personId,
        role,
      }
      await assertNoOverlap(em, key, { validFrom, validTo }, row.id)
      row.role = role
      row.validFrom = validFrom
      row.validTo = validTo
      row.updatedAt = new Date()
      await flushMembership(em)
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'updated', membershipEvents)
    return result
  },
  buildLog: ({ result }) => buildMembershipLog(result, 'groups.audit.memberships.update', 'Change a group membership'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeMembershipReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    await restoreMembership(ctx, logEntry.snapshotBefore as MembershipSnapshot | null | undefined)
  },
}

/** Ends a membership: `valid_to` becomes its last active day (default: today in the club zone); history stays. */
const endMembershipCommand: CommandHandler<Record<string, unknown>, MembershipCommandResult> = {
  id: 'groups.memberships.end',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.memberships.end', async (em) => {
      const authorized = await authorizeScoped(existingSpec(membershipEndSchema, ctx), rawInput, ctx, em)
      const row = (authorized.entity as LockedMembership).membership
      const before = membershipSnapshot(row)
      const today = await clubToday(ctx.container, {
        tenantId: authorized.tenantId,
        organizationId: authorized.organizationId,
      })
      const validTo = authorized.parsed.validTo ?? today
      // REQ-A03: ending before the first day, or ending a membership that has not started, is a coded 422; such a
      // membership is edited or removed instead.
      if (endRefused(row, validTo, today)) {
        await groupsErrors.throw('membership_not_started', { validFrom: row.validFrom })
      }
      // A chosen last day may lie past the current one; like every other write it must not overlap another period.
      const key = {
        tenantId: row.tenantId,
        organizationId: row.organizationId,
        groupId: row.groupId,
        personId: row.personId,
        role: row.role,
      }
      await assertNoOverlap(em, key, { validFrom: row.validFrom, validTo }, row.id)
      row.validTo = validTo
      row.updatedAt = new Date()
      await flushMembership(em)
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'updated', membershipEvents)
    return result
  },
  buildLog: ({ result }) => buildMembershipLog(result, 'groups.audit.memberships.end', 'End a group membership'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeMembershipReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    await restoreMembership(ctx, logEntry.snapshotBefore as MembershipSnapshot | null | undefined)
  },
}

/**
 * Whether a started membership was used, from `activities.groupUsage` (REQ-A03): null without the contract (Remove is
 * then allowed only before the start); a failing contract answers 503 `group_usage_failed`.
 */
async function membershipUsed(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  row: GroupMembership,
): Promise<boolean | null> {
  const usage = groupUsageContract(ctx.container)
  if (!usage) return null
  try {
    return await usage.membershipUsed(em, {
      tenantId: row.tenantId,
      organizationId: row.organizationId,
      groupId: row.groupId,
      personId: row.personId,
      from: row.validFrom,
      to: row.validTo ?? null,
    })
  } catch {
    return groupsErrors.throw('group_usage_failed')
  }
}

/**
 * Removes a membership entered by mistake (REQ-A03): a soft delete of one that has not started, or of a started one
 * that was never used (else 409 `membership_in_use`; the caller ends it instead). Issued charges stay (V-A01).
 */
const deleteMembershipCommand: CommandHandler<Record<string, unknown>, MembershipCommandResult> = {
  id: 'groups.memberships.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.memberships.delete', async (em) => {
      const authorized = await authorizeScoped(existingSpec(membershipDeleteSchema, ctx), rawInput, ctx, em)
      const row = (authorized.entity as LockedMembership).membership
      const today = await clubToday(ctx.container, {
        tenantId: authorized.tenantId,
        organizationId: authorized.organizationId,
      })
      const used = row.validFrom > today ? null : await membershipUsed(ctx, em, row)
      if (!mayRemoveMembership(row, today, used)) {
        await groupsErrors.throw('membership_in_use', { membershipId: row.id })
      }
      const before = membershipSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'deleted', membershipEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: MEMBERSHIP_RESOURCE_KIND,
      labelKey: 'groups.audit.memberships.delete',
      fallback: 'Remove a group membership',
      after: null,
      parent: { resourceKind: 'groups.group', resourceId: result.entity.groupId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeMembershipReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    await restoreMembership(ctx, logEntry.snapshotBefore as MembershipSnapshot | null | undefined, true)
  },
}

/** The moved membership and both groups, row-locked: the membership first, then the two groups in id order. */
type LockedMove = LockedMembership & { target: Group | null }

/**
 * The scope target of a move is the moved membership (its section and group); the target group is checked against
 * the same grants with `assertInScope` (403 `scope_denied` outside the caller's sections). Locking both groups in id
 * order keeps two opposite moves from deadlocking, and serializes the overlap checks of both rosters.
 */
function moveSpec(ctx: CommandRuntimeContext): AuthorizeScopedSpec<typeof membershipMoveSchema, LockedMove> {
  return {
    input: membershipMoveSchema,
    resourceKind: MEMBERSHIP_RESOURCE_KIND,
    allowedKinds: GROUP_WRITE_KINDS,
    loadTarget: async (parsed, em, lock) => {
      const tenantId = trustedTenantId(ctx)
      if (!tenantId) return null
      const membership = await em.findOne(GroupMembership, { id: parsed.id, tenantId, deletedAt: null }, lock)
      if (!membership) return null
      const scope = { tenantId: membership.tenantId, organizationId: membership.organizationId }
      const locked = new Map<string, Group | null>()
      for (const groupId of [...new Set([membership.groupId, parsed.toGroupId])].sort()) {
        locked.set(groupId, await lockGroup(em, scope, groupId))
      }
      const group = locked.get(membership.groupId)
      if (!group) return null
      return { membership, group, target: locked.get(parsed.toGroupId) ?? null, updatedAt: membership.updatedAt }
    },
    resolveTarget: (_parsed, entity) => {
      const loaded = entity as LockedMove
      return membershipTarget(loaded.membership.id, loaded.group)
    },
  }
}

export type MembershipMoveSnapshot = { ended: MembershipSnapshot; started: MembershipSnapshot }

export type MembershipMoveResult = MembershipCommandResult & { started: GroupMembership }

/**
 * `groups.memberships.move` (people life-cycle spec *Domain Vocabulary* → Group move, REQ-L11, DD-L15; #312): ends the
 * membership on the day before `date` and starts one of the same role in the target group on `date`, in one
 * transaction. The target group is a live, active group of the club in the caller's scope (422
 * `groups_reference_invalid` for the same or an unknown or inactive group, 403 `scope_denied` outside the caller's
 * sections); an overlapping membership in the target group answers 409 `membership_overlap`. Both writes emit their
 * `groups.membership.*` event, so the `activities` subscriber drops the old group's undecided declarations after the
 * last day; the charge generation charges the month once (`payments/lib/charge-plan.ts`). Undo restores the old
 * membership and removes the new one.
 */
const moveMembershipCommand: CommandHandler<Record<string, unknown>, MembershipMoveResult> = {
  id: 'groups.memberships.move',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.memberships.move', async (em) => {
      const authorized = await authorizeScoped(moveSpec(ctx), rawInput, ctx, em)
      const { membership: row, target } = authorized.entity as LockedMove
      const { parsed } = authorized
      if (!target || !target.isActive) {
        await groupsErrors.throw('groups_reference_invalid', { field: 'toGroupId' })
      }
      const targetGroup = target as Group
      await assertInScope(authorized.scope, GROUP_WRITE_KINDS, groupTarget(targetGroup))
      const today = await clubToday(ctx.container, {
        tenantId: authorized.tenantId,
        organizationId: authorized.organizationId,
      })
      const plan = planMove(
        { groupId: row.groupId, validFrom: row.validFrom, validTo: row.validTo ?? null },
        { toGroupId: targetGroup.id, date: parsed.date },
        today,
      )
      if (!plan.ok) {
        if (plan.problem === 'same_group') await groupsErrors.throw('groups_reference_invalid', { field: 'toGroupId' })
        if (plan.problem === 'not_started')
          await groupsErrors.throw('membership_not_started', { validFrom: row.validFrom })
        return groupsErrors.throw('groups_reference_invalid', { field: 'date' })
      }
      const before = membershipSnapshot(row)
      const key = {
        tenantId: row.tenantId,
        organizationId: row.organizationId,
        groupId: targetGroup.id,
        personId: row.personId,
        role: row.role,
      }
      await assertNoOverlap(em, key, plan.next, null)
      row.validTo = plan.lastDay
      row.updatedAt = new Date()
      const started = em.create(GroupMembership, {
        id: randomUUID(),
        tenantId: row.tenantId,
        organizationId: row.organizationId,
        groupId: targetGroup.id,
        personId: row.personId,
        role: row.role,
        validFrom: plan.next.validFrom,
        validTo: plan.next.validTo,
      })
      em.persist(started)
      await flushMembership(em)
      return { entity: row, started, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'updated', membershipEvents)
    await emitGroupsSideEffects(ctx, result.started, 'created', membershipEvents)
    return result
  },
  buildLog: async ({ result }) => ({
    ...(await buildMembershipLog(result, 'groups.audit.memberships.move', 'Move to another group')),
    snapshotAfter: {
      ended: membershipSnapshot(result.entity),
      started: membershipSnapshot(result.started),
    } satisfies MembershipMoveSnapshot,
  }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeMembershipReplay(ctx, logEntry.resourceId)
    const after = logEntry.snapshotAfter as MembershipMoveSnapshot | null | undefined
    await authorizeMembershipReplay(ctx, after?.started?.id)
  },
  async undo({ ctx, logEntry }) {
    const after = logEntry.snapshotAfter as MembershipMoveSnapshot | null | undefined
    const { membership: started } = await authorizeMembershipReplay(ctx, after?.started?.id)
    started.deletedAt = new Date()
    started.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitGroupsSideEffects(ctx, started, 'deleted', membershipEvents, true)
    await restoreMembership(ctx, logEntry.snapshotBefore as MembershipSnapshot | null | undefined)
  },
}

registerCommand(createMembershipCommand)
registerCommand(updateMembershipCommand)
registerCommand(endMembershipCommand)
registerCommand(deleteMembershipCommand)
registerCommand(moveMembershipCommand)
