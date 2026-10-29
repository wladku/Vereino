// `groups.memberships.create|update|end` (club spec glossary *Membership*; TEST-030; #30 criteria 1–2): a person's
// membership of a group as `participant`, `coach` or `assistant` for a period. A coordinator writes the memberships of
// the groups of their sections, the club administrator every membership. A membership is ended through `valid_to`, never
// deleted, so the roster keeps its history. Every write takes the group's row lock first and then refuses an
// overlapping live membership of the same person, group and role (409 `membership_overlap`), so two concurrent writes
// cannot both pass; the partial unique index on open-ended memberships backs the check. The person is a live `people`
// person of the club (422 `groups_reference_invalid`). Every change emits `groups.membership.*`, on which the
// `groups:sync-member-roles` subscriber recomputes the person's `auth` roles (an adult participant is a payer).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { isInvertedPeriod, type Scope } from '@vereino/core'
import { authorizeScoped, foundationErrors, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { groupsErrors } from '../api/errors'
import { type Group, GroupMembership } from '../data/entities'
import { membershipCreateSchema, membershipEndSchema, membershipUpdateSchema } from '../data/validators'
import { firstOverlapping, type MembershipRole } from '../lib/groups-rules'
import { clubToday } from '../services/club-clock'
import { findPersons } from '../services/directory'
import {
  GROUP_WRITE_KINDS,
  emitGroupsSideEffects,
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
): Promise<LockedMembership | null> {
  const tenantId = trustedTenantId(ctx)
  if (!tenantId) return null
  const membership = await em.findOne(GroupMembership, { id, tenantId, deletedAt: null }, lock)
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
): AuthorizeScopedSpec<TSchema, LockedMembership> {
  return {
    input,
    resourceKind: MEMBERSHIP_RESOURCE_KIND,
    allowedKinds: GROUP_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => loadMembershipLocked(em, ctx, parsed.id, lock),
    resolveTarget: (_parsed, entity) => {
      const loaded = entity as LockedMembership
      return membershipTarget(loaded.membership.id, loaded.group)
    },
  }
}

async function authorizeMembershipReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
): Promise<{ membership: GroupMembership; scope: Scope }> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] membership replay needs the replay transaction and the id')
  const authorized = await authorizeScoped(existingSpec(z.object({ id: z.uuid() }), ctx), { id }, ctx, em, {
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

/** Undo of an update or an end: restores the previous role and period, refusing a restore that would overlap. */
async function restoreMembership(ctx: CommandRuntimeContext, before: MembershipSnapshot | null | undefined) {
  if (!before?.id) throw new Error('[internal] missing membership snapshot for undo')
  const { membership: row } = await authorizeMembershipReplay(ctx, before.id)
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
  row.updatedAt = new Date()
  await flushMembership(em)
  await emitGroupsSideEffects(ctx, row, 'updated', membershipEvents, true)
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
      const validTo =
        authorized.parsed.validTo ??
        (await clubToday(ctx.container, { tenantId: authorized.tenantId, organizationId: authorized.organizationId }))
      if (isInvertedPeriod(row.validFrom, validTo)) await foundationErrors.throw('validity_inverted')
      row.validTo = validTo
      row.updatedAt = new Date()
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

registerCommand(createMembershipCommand)
registerCommand(updateMembershipCommand)
registerCommand(endMembershipCommand)
