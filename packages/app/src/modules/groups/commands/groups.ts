// `groups.groups.create|update|delete` (club spec glossary *Group*, DD-03a, REQ-004, TEST-030): a group of one
// section, of kind `team` or `class_group`. A coordinator writes the groups of their sections (a group moved to
// another section must be in their scope on both sides), the club administrator every group. Team-only fields on a
// class group answer 422 `group_team_fields_on_class_group`; the section is a live `club_core` section of the club and
// an active group needs an active section; a season is a live season of the club, read under its row lock so a
// concurrent season delete cannot pass its "in use" check. A group with memberships is deactivated, not deleted
// (409 `group_has_memberships`), so the roster history survives.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import type { Scope } from '@vereino/core'
import { assertInScope, authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { groupsErrors } from '../api/errors'
import { Group, GroupMembership, Season } from '../data/entities'
import { groupCreateSchema, groupDeleteSchema, groupUpdateSchema } from '../data/validators'
import { disallowedTeamFields, type GroupKind } from '../lib/groups-rules'
import { findSections } from '../services/directory'
import {
  GROUP_WRITE_KINDS,
  emitGroupsSideEffects,
  groupTarget,
  groupsEvents,
  groupsLog,
  inWriteTransaction,
  loadGroupLocked,
  undoRestore,
  type GroupsCommandResult,
  type GroupsScope,
} from './shared'

export const GROUP_RESOURCE_KIND = 'groups.group'

export const groupEvents = groupsEvents<Group>('group')

export type GroupSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  sectionId: string
  name: string
  kind: GroupKind
  league: string | null
  seasonId: string | null
  description: string | null
  isActive: boolean
}

export type GroupCommandResult = GroupsCommandResult<Group, GroupSnapshot>

export function groupSnapshot(row: Group): GroupSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    sectionId: row.sectionId,
    name: row.name,
    kind: row.kind,
    league: row.league ?? null,
    seasonId: row.seasonId ?? null,
    description: row.description ?? null,
    isActive: row.isActive,
  }
}

function restoreGroup(row: Group, before: GroupSnapshot): void {
  row.sectionId = before.sectionId
  row.name = before.name
  row.kind = before.kind
  row.league = before.league
  row.seasonId = before.seasonId
  row.description = before.description
  row.isActive = before.isActive
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock) => loadGroupLocked(em, ctx, id, lock, includeDeleted)
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<Group | null>,
): AuthorizeScopedSpec<TSchema, Group> {
  return {
    input,
    resourceKind: GROUP_RESOURCE_KIND,
    allowedKinds: GROUP_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => groupTarget(entity as Group),
  }
}

async function authorizeGroupReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<{ row: Group; scope: Scope }> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] group replay needs the replay transaction and the id')
  const authorized = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), loader(ctx, includeDeleted)),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return { row: authorized.entity as Group, scope: authorized.scope }
}

/** The group as a scope target in another section (a move needs the scope of the target section too). */
function movedTarget(row: Group, sectionId: string) {
  return groupTarget({ id: row.id, tenantId: row.tenantId, organizationId: row.organizationId, sectionId })
}

type GroupShape = {
  sectionId: string
  kind: GroupKind
  league: string | null
  seasonId: string | null
  isActive: boolean
}

/**
 * The rules of a group's fields, checked on the merged values of a write: no team field on a class group (422), a live
 * section of the club (422 `groups_reference_invalid`) that is active for an active group (422
 * `group_section_inactive`), and a live season of the club, row-locked (422 `groups_reference_invalid`).
 */
async function assertGroupShape(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: GroupsScope,
  shape: GroupShape,
  changed: { section: boolean; activated: boolean; season: boolean },
): Promise<void> {
  const fields = disallowedTeamFields(shape.kind, { league: shape.league, seasonId: shape.seasonId })
  if (fields.length > 0) await groupsErrors.throw('group_team_fields_on_class_group', { fields })
  if (changed.section || changed.activated) {
    const section = (await findSections(ctx.container, scope, [shape.sectionId], em)).get(shape.sectionId)
    if (!section) await groupsErrors.throw('groups_reference_invalid', { field: 'sectionId' })
    if (shape.isActive && section?.isActive === false) await groupsErrors.throw('group_section_inactive')
  }
  if (changed.season && shape.seasonId) {
    const season = await em.findOne(
      Season,
      { id: shape.seasonId, ...scope, deletedAt: null },
      { fields: ['id'], lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    if (!season) await groupsErrors.throw('groups_reference_invalid', { field: 'seasonId' })
  }
}

/** Number of live memberships of a group, ended ones included (the roster history). */
function countMemberships(em: EntityManager, scope: GroupsScope, groupId: string): Promise<number> {
  return em.count(GroupMembership, { ...scope, groupId, deletedAt: null })
}

const createGroupCommand: CommandHandler<Record<string, unknown>, GroupCommandResult> = {
  id: 'groups.groups.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'groups.groups.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: groupCreateSchema,
          resourceKind: GROUP_RESOURCE_KIND,
          allowedKinds: GROUP_WRITE_KINDS,
          resolveTarget: (parsed, _entity, scope) => groupTarget({ id, ...scope, sectionId: parsed.sectionId }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const shape: GroupShape = {
        sectionId: parsed.sectionId,
        kind: parsed.kind,
        league: parsed.league ?? null,
        seasonId: parsed.seasonId ?? null,
        isActive: parsed.isActive ?? true,
      }
      await assertGroupShape(ctx, em, { tenantId, organizationId }, shape, {
        section: true,
        activated: shape.isActive,
        season: true,
      })
      const row = em.create(Group, {
        id,
        tenantId,
        organizationId,
        sectionId: shape.sectionId,
        name: parsed.name,
        kind: shape.kind,
        league: shape.league,
        seasonId: shape.seasonId,
        description: parsed.description ?? null,
        isActive: shape.isActive,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'created', groupEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: GROUP_RESOURCE_KIND,
      labelKey: 'groups.audit.groups.create',
      fallback: 'Create a group',
      after: groupSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGroupReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const { row } = await authorizeGroupReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
    if ((await countMemberships(em, scope, row.id)) > 0) await groupsErrors.throw('group_has_memberships')
    row.deletedAt = new Date()
    await em.flush()
    await emitGroupsSideEffects(ctx, row, 'deleted', groupEvents, true)
  },
}

const updateGroupCommand: CommandHandler<Record<string, unknown>, GroupCommandResult> = {
  id: 'groups.groups.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.groups.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(groupUpdateSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as Group
      const before = groupSnapshot(row)
      const patch = authorized.parsed
      const shape: GroupShape = {
        sectionId: patch.sectionId ?? row.sectionId,
        kind: patch.kind ?? row.kind,
        league: patch.league !== undefined ? patch.league : (row.league ?? null),
        seasonId: patch.seasonId !== undefined ? patch.seasonId : (row.seasonId ?? null),
        isActive: patch.isActive ?? row.isActive,
      }
      const sectionChanged = shape.sectionId !== row.sectionId
      // Moving a group to another section needs the scope of the target section as well (a coordinator of A cannot
      // move a group into B).
      if (sectionChanged) {
        await assertInScope(authorized.scope, GROUP_WRITE_KINDS, movedTarget(row, shape.sectionId))
      }
      await assertGroupShape(ctx, em, { tenantId: row.tenantId, organizationId: row.organizationId }, shape, {
        section: sectionChanged,
        activated: shape.isActive && !row.isActive,
        season: shape.seasonId !== (row.seasonId ?? null),
      })
      row.sectionId = shape.sectionId
      row.kind = shape.kind
      row.league = shape.league
      row.seasonId = shape.seasonId
      if (patch.name !== undefined) row.name = patch.name
      if (patch.description !== undefined) row.description = patch.description
      row.isActive = shape.isActive
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'updated', groupEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: GROUP_RESOURCE_KIND,
      labelKey: 'groups.audit.groups.update',
      fallback: 'Change a group',
      after: groupSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGroupReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as GroupSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing group snapshot for undo')
    const { row, scope } = await authorizeGroupReplay(ctx, before.id)
    const em = ctx.transactionalEm as EntityManager
    if (before.sectionId !== row.sectionId) {
      await assertInScope(scope, GROUP_WRITE_KINDS, movedTarget(row, before.sectionId))
    }
    await assertGroupShape(ctx, em, { tenantId: row.tenantId, organizationId: row.organizationId }, before, {
      section: before.sectionId !== row.sectionId,
      activated: before.isActive && !row.isActive,
      season: before.seasonId !== (row.seasonId ?? null),
    })
    await undoRestore(ctx, row, before, restoreGroup, groupEvents, 'updated')
  },
}

const deleteGroupCommand: CommandHandler<Record<string, unknown>, GroupCommandResult> = {
  id: 'groups.groups.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.groups.delete', async (em) => {
      const authorized = await authorizeScoped(existingSpec(groupDeleteSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as Group
      // The group's row lock (taken by `loadTarget`) is the lock every membership write takes first, so no membership
      // can be added between this count and the delete.
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      if ((await countMemberships(em, scope, row.id)) > 0) await groupsErrors.throw('group_has_memberships')
      const before = groupSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'deleted', groupEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: GROUP_RESOURCE_KIND,
      labelKey: 'groups.audit.groups.delete',
      fallback: 'Delete a group',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGroupReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as GroupSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing group snapshot for undo')
    const { row } = await authorizeGroupReplay(ctx, before.id, true)
    await undoRestore(ctx, row, before, restoreGroup, groupEvents, 'created')
  },
}

registerCommand(createGroupCommand)
registerCommand(updateGroupCommand)
registerCommand(deleteGroupCommand)
