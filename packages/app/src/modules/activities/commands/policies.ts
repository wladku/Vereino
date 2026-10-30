// `activities.attendance_policies.create|update|delete` (club spec glossary *Declaration policy*, *Data Models* →
// `activities_attendance_policies`, API row `/api/activities/attendance-policies`; REQ-007; D-006; #32): the club's
// rules for who declares for a minor with an account — per club, group, away trip or activity type — maintained by the
// club administrator and every coordinator (a club-wide configuration, like the `groups` dictionaries). A second
// policy for the same scope key answers 409 `attendance_policy_duplicate` (backed by the partial unique index over the
// coalesced keys); scope fields that do not fit the scope 422 `attendance_policy_scope_invalid`; a `group` policy names
// a live group of the club (422 `activities_reference_invalid`). The default policies are seeded by `setup.ts`.
import { randomUUID } from 'node:crypto'
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import type { GrantKind, ScopeMatchOptions } from '@vereino/core'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { AttendancePolicy } from '../data/entities'
import {
  attendancePolicyCreateSchema,
  attendancePolicyDeleteSchema,
  attendancePolicyUpdateSchema,
} from '../data/validators'
import { policyKey, policyShapeProblem, type PolicyRow } from '../lib/policy'
import {
  activitiesLog,
  emitAfterCommit,
  inWriteTransaction,
  lookupGroup,
  trustedTenantId,
  type ActivitiesCommandResult,
} from './shared'

export const ATTENDANCE_POLICY_RESOURCE_KIND = 'activities.attendance_policy'

/** Policies are club-wide configuration: the coordinator's grant counts club-wide for them, like the `groups` dictionaries. */
export const POLICY_WRITE_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']
export const POLICY_WRITE_OPTIONS: ScopeMatchOptions = { clubWideKinds: ['coordinator'] }

export type AttendancePolicySnapshot = PolicyRow & { id: string; tenantId: string; organizationId: string }

export type AttendancePolicyCommandResult = ActivitiesCommandResult<AttendancePolicy, AttendancePolicySnapshot>

export function attendancePolicySnapshot(row: AttendancePolicy): AttendancePolicySnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    scope: row.scope,
    groupId: row.groupId ?? null,
    activityType: row.activityType ?? null,
    minorDeclarationMode: row.minorDeclarationMode,
    confirmTimeoutHours: row.confirmTimeoutHours,
    defaultAfterTimeout: row.defaultAfterTimeout,
  }
}

function restorePolicy(row: AttendancePolicy, before: AttendancePolicySnapshot): void {
  row.minorDeclarationMode = before.minorDeclarationMode
  row.confirmTimeoutHours = before.confirmTimeoutHours
  row.defaultAfterTimeout = before.defaultAfterTimeout
  row.deletedAt = null
}

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof UniqueConstraintViolationException) return true
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<AttendancePolicy | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(AttendancePolicy, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

function clubTarget(row: Pick<AttendancePolicy, 'id' | 'tenantId' | 'organizationId'>) {
  return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId }
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<AttendancePolicy | null>,
): AuthorizeScopedSpec<TSchema, AttendancePolicy> {
  return {
    input,
    resourceKind: ATTENDANCE_POLICY_RESOURCE_KIND,
    allowedKinds: POLICY_WRITE_KINDS,
    matchOptions: POLICY_WRITE_OPTIONS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => clubTarget(entity as AttendancePolicy),
  }
}

async function authorizePolicyReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<AttendancePolicy> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] attendance policy replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), loader(ctx, includeDeleted)),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as AttendancePolicy
}

/** 409 `attendance_policy_duplicate` when another live policy of the club has the same scope key. */
async function assertScopeKeyFree(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  policy: Pick<PolicyRow, 'scope' | 'groupId' | 'activityType'>,
): Promise<void> {
  const rows = await em.find(
    AttendancePolicy,
    { ...scope, scope: policy.scope, deletedAt: null },
    { fields: ['id', 'scope', 'groupId', 'activityType'] },
  )
  const key = policyKey(policy)
  if (
    rows.some(
      (row) =>
        policyKey({ scope: row.scope, groupId: row.groupId ?? null, activityType: row.activityType ?? null }) === key,
    )
  ) {
    await activitiesErrors.throw('attendance_policy_duplicate')
  }
}

/** Flushes and maps the partial unique index to 409 (a concurrent create with the same key). */
async function flushPolicy(em: EntityManager): Promise<void> {
  try {
    await em.flush()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) await activitiesErrors.throw('attendance_policy_duplicate')
    throw error
  }
}

async function emitPolicy(row: AttendancePolicy, action: 'created' | 'updated' | 'deleted'): Promise<void> {
  await emitAfterCommit(
    `activities.attendance_policy.${action}`,
    { tenantId: row.tenantId, organizationId: row.organizationId },
    { id: row.id },
  )
}

const createPolicyCommand: CommandHandler<Record<string, unknown>, AttendancePolicyCommandResult> = {
  id: 'activities.attendance_policies.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'activities.attendance_policies.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: attendancePolicyCreateSchema,
          resourceKind: ATTENDANCE_POLICY_RESOURCE_KIND,
          allowedKinds: POLICY_WRITE_KINDS,
          matchOptions: POLICY_WRITE_OPTIONS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const groupId = parsed.groupId ?? null
      const activityType = parsed.activityType ?? null
      const problem = policyShapeProblem(parsed.scope, groupId, activityType)
      if (problem) await activitiesErrors.throw('attendance_policy_scope_invalid', { problem })
      if (groupId && !(await lookupGroup(ctx, groupId, em))) {
        await activitiesErrors.throw('activities_reference_invalid', { field: 'groupId' })
      }
      await assertScopeKeyFree(em, scope, { scope: parsed.scope, groupId, activityType })
      const row = em.create(AttendancePolicy, {
        id,
        ...scope,
        scope: parsed.scope,
        groupId,
        activityType,
        minorDeclarationMode: parsed.minorDeclarationMode,
        ...(parsed.confirmTimeoutHours !== undefined ? { confirmTimeoutHours: parsed.confirmTimeoutHours } : {}),
        ...(parsed.defaultAfterTimeout !== undefined ? { defaultAfterTimeout: parsed.defaultAfterTimeout } : {}),
      })
      em.persist(row)
      await flushPolicy(em)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitPolicy(result.entity, 'created')
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ATTENDANCE_POLICY_RESOURCE_KIND,
      labelKey: 'activities.audit.policies.create',
      fallback: 'Create a declaration policy',
      after: attendancePolicySnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePolicyReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizePolicyReplay(ctx, logEntry.resourceId)
    row.deletedAt = new Date()
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
    await emitPolicy(row, 'deleted')
  },
}

const updatePolicyCommand: CommandHandler<Record<string, unknown>, AttendancePolicyCommandResult> = {
  id: 'activities.attendance_policies.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'activities.attendance_policies.update', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(attendancePolicyUpdateSchema, loader(ctx)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as AttendancePolicy
      const patch = authorized.parsed
      const before = attendancePolicySnapshot(row)
      if (patch.minorDeclarationMode !== undefined) row.minorDeclarationMode = patch.minorDeclarationMode
      if (patch.confirmTimeoutHours !== undefined) row.confirmTimeoutHours = patch.confirmTimeoutHours
      if (patch.defaultAfterTimeout !== undefined) row.defaultAfterTimeout = patch.defaultAfterTimeout
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitPolicy(result.entity, 'updated')
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ATTENDANCE_POLICY_RESOURCE_KIND,
      labelKey: 'activities.audit.policies.update',
      fallback: 'Change a declaration policy',
      after: attendancePolicySnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePolicyReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as AttendancePolicySnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing policy snapshot for undo')
    const row = await authorizePolicyReplay(ctx, before.id)
    restorePolicy(row, before)
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
    await emitPolicy(row, 'updated')
  },
}

const deletePolicyCommand: CommandHandler<Record<string, unknown>, AttendancePolicyCommandResult> = {
  id: 'activities.attendance_policies.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'activities.attendance_policies.delete', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(attendancePolicyDeleteSchema, loader(ctx)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as AttendancePolicy
      const before = attendancePolicySnapshot(row)
      const now = new Date()
      row.deletedAt = now
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitPolicy(result.entity, 'deleted')
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ATTENDANCE_POLICY_RESOURCE_KIND,
      labelKey: 'activities.audit.policies.delete',
      fallback: 'Delete a declaration policy',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePolicyReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as AttendancePolicySnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing policy snapshot for undo')
    const row = await authorizePolicyReplay(ctx, before.id, true)
    const em = ctx.transactionalEm as EntityManager
    await assertScopeKeyFree(em, { tenantId: row.tenantId, organizationId: row.organizationId }, before)
    restorePolicy(row, before)
    row.updatedAt = new Date()
    await flushPolicy(em)
    await emitPolicy(row, 'created')
  },
}

registerCommand(createPolicyCommand)
registerCommand(updatePolicyCommand)
registerCommand(deletePolicyCommand)
