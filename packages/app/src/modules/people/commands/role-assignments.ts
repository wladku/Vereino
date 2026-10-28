// `people.role_assignments.create|update|end` (club spec *Role assignment*, DD-33; foundation spec DD-F05, DD-F18;
// TEST-005). Only the club administrator assigns staff roles. Every change emits `people.role_assignment.*`, on which
// the `people:sync-auth-roles` subscriber recomputes the person's `auth` roles; an assignment of a person without
// an account is stored and its role is granted when the account is created.
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { isInvertedPeriod, type ActingRole } from '@vereino/core'
import { authorizeScoped, foundationErrors, type AuthorizeScopedSpec } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { RoleAssignment } from '../data/entities'
import { roleAssignmentCreateSchema, roleAssignmentEndSchema, roleAssignmentUpdateSchema } from '../data/validators'
import { roleScopeProblem } from '../lib/people-rules'
import { clubToday } from '../services/club-clock'
import {
  inWriteTransaction,
  loadRoleAssignmentLocked,
  personExists,
  roleAssignmentEvents,
  roleAssignmentSnapshot,
  roleAssignmentTarget,
  type RoleAssignmentSnapshot,
} from './shared'

const RESOURCE_KIND = 'people.role_assignment'
const ALLOWED_KINDS = ['club_admin'] as const

export type RoleAssignmentCommandResult = {
  assignment: RoleAssignment
  actingRole: ActingRole
  before: RoleAssignmentSnapshot | null
}

async function assertRoleScope(role: RoleAssignment['role'], sectionId: string | null | undefined): Promise<void> {
  const problem = roleScopeProblem(role, sectionId)
  if (problem === 'required') await peopleErrors.throw('role_scope_required')
  if (problem === 'unexpected') await peopleErrors.throw('role_scope_unexpected')
}

function emitAssignment(ctx: CommandRuntimeContext, row: RoleAssignment, action: 'created' | 'updated' | 'deleted') {
  return emitCrudSideEffects({
    dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
    action,
    entity: row,
    identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
    events: roleAssignmentEvents,
  })
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
): AuthorizeScopedSpec<TSchema, RoleAssignment> {
  return {
    input,
    resourceKind: RESOURCE_KIND,
    allowedKinds: ALLOWED_KINDS,
    loadTarget: (parsed, em, lock) => loadRoleAssignmentLocked(em, ctx, parsed.id, lock),
    resolveTarget: (_parsed, entity) => roleAssignmentTarget(entity as RoleAssignment),
  }
}

async function authorizeAssignmentReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
): Promise<RoleAssignment> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] role assignment replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(existingSpec(z.object({ id: z.uuid() }), ctx), { id }, ctx, em, {
    mode: 'replay',
  })
  return entity as RoleAssignment
}

async function buildAssignmentLog(result: RoleAssignmentCommandResult, labelKey: string, fallback: string) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(labelKey, fallback),
    resourceKind: RESOURCE_KIND,
    resourceId: result.assignment.id,
    tenantId: result.assignment.tenantId,
    organizationId: result.assignment.organizationId,
    parentResourceKind: 'people.person',
    parentResourceId: result.assignment.personId,
    snapshotBefore: result.before,
    snapshotAfter: roleAssignmentSnapshot(result.assignment),
    context: { actingRole: result.actingRole },
  }
}

/** Undo of an update or an end: restores the previous period, role and section. */
async function restoreAssignment(ctx: CommandRuntimeContext, before: RoleAssignmentSnapshot | null | undefined) {
  if (!before?.id) throw new Error('[internal] missing role assignment snapshot for undo')
  const row = await authorizeAssignmentReplay(ctx, before.id)
  row.role = before.role
  row.sectionId = before.sectionId
  row.validFrom = before.validFrom
  row.validTo = before.validTo
  row.updatedAt = new Date()
  await ctx.transactionalEm?.flush()
  await emitCrudUndoSideEffects({
    dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
    action: 'updated',
    entity: row,
    identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
    events: roleAssignmentEvents,
  })
}

const createRoleAssignmentCommand: CommandHandler<Record<string, unknown>, RoleAssignmentCommandResult> = {
  id: 'people.role_assignments.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'people.role_assignments.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: roleAssignmentCreateSchema,
          resourceKind: RESOURCE_KIND,
          allowedKinds: ALLOWED_KINDS,
          resolveTarget: (parsed, _entity, scope) => ({
            id,
            ...scope,
            personId: parsed.personId,
            sectionId: parsed.sectionId ?? null,
          }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      if (!(await personExists(em, { tenantId, organizationId }, parsed.personId))) {
        const { translate } = await resolveTranslations()
        throw notFound(translate('foundation.errors.not_found', 'Not found'))
      }
      await assertRoleScope(parsed.role, parsed.sectionId)
      const row = em.create(RoleAssignment, {
        id,
        tenantId,
        organizationId,
        personId: parsed.personId,
        role: parsed.role,
        sectionId: parsed.sectionId ?? null,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo ?? null,
      })
      em.persist(row)
      return { assignment: row, actingRole: authorized.actingRole, before: null }
    })
    await emitAssignment(ctx, result.assignment, 'created')
    return result
  },
  buildLog: ({ result }) => buildAssignmentLog(result, 'people.audit.role_assignments.create', 'Assign a staff role'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeAssignmentReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeAssignmentReplay(ctx, logEntry.resourceId)
    row.deletedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitCrudUndoSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'deleted',
      entity: row,
      identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
      events: roleAssignmentEvents,
    })
  },
}

const updateRoleAssignmentCommand: CommandHandler<Record<string, unknown>, RoleAssignmentCommandResult> = {
  id: 'people.role_assignments.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.role_assignments.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(roleAssignmentUpdateSchema, ctx), rawInput, ctx, em)
      const row = authorized.entity as RoleAssignment
      const before = roleAssignmentSnapshot(row)
      const patch = authorized.parsed
      const role = patch.role ?? row.role
      const sectionId = patch.sectionId !== undefined ? patch.sectionId : (row.sectionId ?? null)
      const validFrom = patch.validFrom ?? row.validFrom
      const validTo = patch.validTo !== undefined ? patch.validTo : (row.validTo ?? null)
      if (isInvertedPeriod(validFrom, validTo)) await foundationErrors.throw('validity_inverted')
      await assertRoleScope(role, sectionId)
      row.role = role
      row.sectionId = sectionId
      row.validFrom = validFrom
      row.validTo = validTo
      row.updatedAt = new Date()
      return { assignment: row, actingRole: authorized.actingRole, before }
    })
    await emitAssignment(ctx, result.assignment, 'updated')
    return result
  },
  buildLog: ({ result }) =>
    buildAssignmentLog(result, 'people.audit.role_assignments.update', 'Change a staff role assignment'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeAssignmentReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    await restoreAssignment(ctx, logEntry.snapshotBefore as RoleAssignmentSnapshot | null | undefined)
  },
}

/** Ends an assignment: `valid_to` becomes its last active day; the role sync revokes the role the day after. */
const endRoleAssignmentCommand: CommandHandler<Record<string, unknown>, RoleAssignmentCommandResult> = {
  id: 'people.role_assignments.end',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.role_assignments.end', async (em) => {
      const authorized = await authorizeScoped(existingSpec(roleAssignmentEndSchema, ctx), rawInput, ctx, em)
      const row = authorized.entity as RoleAssignment
      const before = roleAssignmentSnapshot(row)
      const validTo =
        authorized.parsed.validTo ??
        (await clubToday(ctx.container, { tenantId: authorized.tenantId, organizationId: authorized.organizationId }))
      if (isInvertedPeriod(row.validFrom, validTo)) await foundationErrors.throw('validity_inverted')
      row.validTo = validTo
      row.updatedAt = new Date()
      return { assignment: row, actingRole: authorized.actingRole, before }
    })
    await emitAssignment(ctx, result.assignment, 'updated')
    return result
  },
  buildLog: ({ result }) =>
    buildAssignmentLog(result, 'people.audit.role_assignments.end', 'End a staff role assignment'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeAssignmentReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    await restoreAssignment(ctx, logEntry.snapshotBefore as RoleAssignmentSnapshot | null | undefined)
  },
}

registerCommand(createRoleAssignmentCommand)
registerCommand(updateRoleAssignmentCommand)
registerCommand(endRoleAssignmentCommand)
