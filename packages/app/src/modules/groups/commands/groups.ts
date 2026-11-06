// `groups.groups.create|update|delete` (club spec glossary *Group*, DD-03a, REQ-004, TEST-030): a group of one
// section, of kind `team` or `class_group`. A coordinator writes the groups of their sections (a group moved to
// another section must be in their scope on both sides), the club administrator every group. Team-only fields on a
// class group answer 422 `group_team_fields_on_class_group`; the section is a live `club_core` section of the club and
// an active group needs an active section; a season is a live season of the club, read under its row lock so a
// concurrent season delete cannot pass its "in use" check; an age category is an entry of the club's age category
// dictionary (`dictionaries`, REQ-019, #92). A group with memberships is deactivated, not deleted
// (409 `group_has_memberships`), so the roster history survives. The public fields (#91, DD-29) follow the same writes;
// an age range whose youngest age is above the oldest answers 422 `group_age_range_inverted` on the `ageTo` field.
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
import { ageRangeInverted, disallowedTeamFields, type GroupKind } from '../lib/groups-rules'
import { isAgeCategoryEntry } from '../services/age-categories'
import { lockSectionForShare } from '../services/directory'
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
  ageCategoryEntryId: string | null
  league: string | null
  seasonId: string | null
  description: string | null
  isActive: boolean
  /** The public fields (#91); absent in snapshots written before them, so an undo then keeps the stored values. */
  isPublic?: boolean
  publicDescription?: string | null
  publicConditions?: string | null
  ageFrom?: number | null
  ageTo?: number | null
  levelLabel?: string | null
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
    ageCategoryEntryId: row.ageCategoryEntryId ?? null,
    league: row.league ?? null,
    seasonId: row.seasonId ?? null,
    description: row.description ?? null,
    isActive: row.isActive,
    isPublic: row.isPublic,
    publicDescription: row.publicDescription ?? null,
    publicConditions: row.publicConditions ?? null,
    ageFrom: row.ageFrom ?? null,
    ageTo: row.ageTo ?? null,
    levelLabel: row.levelLabel ?? null,
  }
}

function restoreGroup(row: Group, before: GroupSnapshot): void {
  row.sectionId = before.sectionId
  row.name = before.name
  row.kind = before.kind
  // Snapshots written before #92 carry no age category.
  row.ageCategoryEntryId = before.ageCategoryEntryId ?? null
  row.league = before.league
  row.seasonId = before.seasonId
  row.description = before.description
  row.isActive = before.isActive
  if (before.isPublic !== undefined) row.isPublic = before.isPublic
  if (before.publicDescription !== undefined) row.publicDescription = before.publicDescription
  if (before.publicConditions !== undefined) row.publicConditions = before.publicConditions
  if (before.ageFrom !== undefined) row.ageFrom = before.ageFrom
  if (before.ageTo !== undefined) row.ageTo = before.ageTo
  if (before.levelLabel !== undefined) row.levelLabel = before.levelLabel
}

/** 422 `group_age_range_inverted` with a field error on `ageTo`, so the form shows it next to the field. */
async function assertAgeRange(ageFrom: number | null, ageTo: number | null): Promise<void> {
  if (!ageRangeInverted(ageFrom, ageTo)) return
  const error = await groupsErrors.create('group_age_range_inverted', { field: 'ageTo' })
  error.body = { ...error.body, fieldErrors: { ageTo: String(error.body.error ?? 'group_age_range_inverted') } }
  throw error
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
  ageCategoryEntryId: string | null
  league: string | null
  seasonId: string | null
  isActive: boolean
}

/**
 * The rules of a group's fields, checked on the merged values of a write: no team field on a class group (422), a live
 * section of the club (422 `groups_reference_invalid`) that is active for an active group (422
 * `group_section_inactive`), a live season of the club, row-locked, and an entry of the club's age category dictionary
 * (both 422 `groups_reference_invalid`). The section
 * is read `FOR SHARE`, so a concurrent deactivation of the section (which holds its row `FOR UPDATE` while it counts
 * the active groups) either waits for this write or is seen by it (UX parity spec DD-U08).
 */
async function assertGroupShape(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: GroupsScope,
  shape: GroupShape,
  changed: { section: boolean; activated: boolean; season: boolean; ageCategory: boolean },
): Promise<void> {
  const fields = disallowedTeamFields(shape.kind, {
    ageCategoryEntryId: shape.ageCategoryEntryId,
    league: shape.league,
    seasonId: shape.seasonId,
  })
  if (fields.length > 0) await groupsErrors.throw('group_team_fields_on_class_group', { fields })
  if (changed.section || changed.activated) {
    const section = await lockSectionForShare(ctx.container, scope, shape.sectionId, em)
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
  if (changed.ageCategory && shape.ageCategoryEntryId) {
    if (!(await isAgeCategoryEntry(em, scope, shape.ageCategoryEntryId))) {
      await groupsErrors.throw('groups_reference_invalid', { field: 'ageCategoryEntryId' })
    }
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
        ageCategoryEntryId: parsed.ageCategoryEntryId ?? null,
        league: parsed.league ?? null,
        seasonId: parsed.seasonId ?? null,
        isActive: parsed.isActive ?? true,
      }
      await assertGroupShape(ctx, em, { tenantId, organizationId }, shape, {
        section: true,
        activated: shape.isActive,
        season: true,
        ageCategory: true,
      })
      await assertAgeRange(parsed.ageFrom ?? null, parsed.ageTo ?? null)
      const row = em.create(Group, {
        id,
        tenantId,
        organizationId,
        sectionId: shape.sectionId,
        name: parsed.name,
        kind: shape.kind,
        ageCategoryEntryId: shape.ageCategoryEntryId,
        league: shape.league,
        seasonId: shape.seasonId,
        description: parsed.description ?? null,
        isActive: shape.isActive,
        isPublic: parsed.isPublic ?? false,
        publicDescription: parsed.publicDescription ?? null,
        publicConditions: parsed.publicConditions ?? null,
        ageFrom: parsed.ageFrom ?? null,
        ageTo: parsed.ageTo ?? null,
        levelLabel: parsed.levelLabel ?? null,
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
        ageCategoryEntryId:
          patch.ageCategoryEntryId !== undefined ? patch.ageCategoryEntryId : (row.ageCategoryEntryId ?? null),
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
        ageCategory: shape.ageCategoryEntryId !== (row.ageCategoryEntryId ?? null),
      })
      const ageFrom = patch.ageFrom !== undefined ? patch.ageFrom : (row.ageFrom ?? null)
      const ageTo = patch.ageTo !== undefined ? patch.ageTo : (row.ageTo ?? null)
      await assertAgeRange(ageFrom, ageTo)
      row.ageFrom = ageFrom
      row.ageTo = ageTo
      if (patch.isPublic !== undefined) row.isPublic = patch.isPublic
      if (patch.publicDescription !== undefined) row.publicDescription = patch.publicDescription
      if (patch.publicConditions !== undefined) row.publicConditions = patch.publicConditions
      if (patch.levelLabel !== undefined) row.levelLabel = patch.levelLabel
      row.sectionId = shape.sectionId
      row.kind = shape.kind
      row.ageCategoryEntryId = shape.ageCategoryEntryId
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
    const beforeShape = { ...before, ageCategoryEntryId: before.ageCategoryEntryId ?? null }
    await assertGroupShape(ctx, em, { tenantId: row.tenantId, organizationId: row.organizationId }, beforeShape, {
      section: before.sectionId !== row.sectionId,
      activated: before.isActive && !row.isActive,
      season: before.seasonId !== (row.seasonId ?? null),
      ageCategory: beforeShape.ageCategoryEntryId !== (row.ageCategoryEntryId ?? null),
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
