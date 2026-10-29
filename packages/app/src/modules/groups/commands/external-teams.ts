// `groups.external_teams.create|update|delete` (club spec *Data Models* → `groups_external_teams`, REQ-020): the
// club-wide dictionary of opponents and tournament guests, written by the club administrator and every coordinator.
// The contact is encrypted at rest (`encryption.ts`); an institution is a live `club_core` institution of the club
// (422 `groups_reference_invalid` otherwise). Delete is a soft delete.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { z } from 'zod'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { groupsErrors } from '../api/errors'
import { ExternalTeam } from '../data/entities'
import { externalTeamCreateSchema, externalTeamDeleteSchema, externalTeamUpdateSchema } from '../data/validators'
import { findInstitutions } from '../services/directory'
import {
  DICTIONARY_WRITE_KINDS,
  DICTIONARY_WRITE_OPTIONS,
  decryptionScope,
  dictionaryTarget,
  emitGroupsSideEffects,
  groupsEvents,
  groupsLog,
  inWriteTransaction,
  trustedTenantId,
  undoCreate,
  undoRestore,
  type GroupsCommandResult,
  type GroupsScope,
} from './shared'

export const EXTERNAL_TEAM_RESOURCE_KIND = 'groups.external_team'

export const externalTeamEvents = groupsEvents<ExternalTeam>('external_team')

export type ExternalTeamSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  name: string
  clubName: string | null
  institutionId: string | null
  contact: string | null
  notes: string | null
}

export type ExternalTeamCommandResult = GroupsCommandResult<ExternalTeam, ExternalTeamSnapshot>

export function externalTeamSnapshot(row: ExternalTeam): ExternalTeamSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    name: row.name,
    clubName: row.clubName ?? null,
    institutionId: row.institutionId ?? null,
    contact: row.contact ?? null,
    notes: row.notes ?? null,
  }
}

function restoreExternalTeam(row: ExternalTeam, before: ExternalTeamSnapshot): void {
  row.name = before.name
  row.clubName = before.clubName
  row.institutionId = before.institutionId
  row.contact = before.contact
  row.notes = before.notes
}

function loader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<ExternalTeam | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    const where = { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }
    return findOneWithDecryption(em, ExternalTeam, where, lock, decryptionScope(ctx))
  }
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<ExternalTeam | null>,
): AuthorizeScopedSpec<TSchema, ExternalTeam> {
  return {
    input,
    resourceKind: EXTERNAL_TEAM_RESOURCE_KIND,
    allowedKinds: DICTIONARY_WRITE_KINDS,
    matchOptions: DICTIONARY_WRITE_OPTIONS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => dictionaryTarget(entity as ExternalTeam),
  }
}

async function authorizeExternalTeamReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<ExternalTeam> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] external team replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), loader(ctx, includeDeleted)),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as ExternalTeam
}

/** 422 `groups_reference_invalid` unless the institution is a live institution of the club. */
async function assertInstitution(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: GroupsScope,
  institutionId: string | null | undefined,
): Promise<void> {
  if (!institutionId) return
  const found = await findInstitutions(ctx.container, scope, [institutionId], em)
  if (!found.has(institutionId)) await groupsErrors.throw('groups_reference_invalid', { field: 'institutionId' })
}

const createExternalTeamCommand: CommandHandler<Record<string, unknown>, ExternalTeamCommandResult> = {
  id: 'groups.external_teams.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'groups.external_teams.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: externalTeamCreateSchema,
          resourceKind: EXTERNAL_TEAM_RESOURCE_KIND,
          allowedKinds: DICTIONARY_WRITE_KINDS,
          matchOptions: DICTIONARY_WRITE_OPTIONS,
          resolveTarget: (_parsed, _entity, scope) => dictionaryTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      await assertInstitution(ctx, em, { tenantId, organizationId }, parsed.institutionId)
      const row = em.create(ExternalTeam, {
        id,
        tenantId,
        organizationId,
        name: parsed.name,
        clubName: parsed.clubName ?? null,
        institutionId: parsed.institutionId ?? null,
        contact: parsed.contact ?? null,
        notes: parsed.notes ?? null,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'created', externalTeamEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: EXTERNAL_TEAM_RESOURCE_KIND,
      labelKey: 'groups.audit.external_teams.create',
      fallback: 'Create an external team',
      after: externalTeamSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeExternalTeamReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeExternalTeamReplay(ctx, logEntry.resourceId)
    await undoCreate(ctx, row, externalTeamEvents)
  },
}

const updateExternalTeamCommand: CommandHandler<Record<string, unknown>, ExternalTeamCommandResult> = {
  id: 'groups.external_teams.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.external_teams.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(externalTeamUpdateSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as ExternalTeam
      const before = externalTeamSnapshot(row)
      const patch = authorized.parsed
      if (patch.institutionId !== undefined && patch.institutionId !== row.institutionId) {
        await assertInstitution(
          ctx,
          em,
          { tenantId: row.tenantId, organizationId: row.organizationId },
          patch.institutionId,
        )
      }
      if (patch.name !== undefined) row.name = patch.name
      if (patch.clubName !== undefined) row.clubName = patch.clubName
      if (patch.institutionId !== undefined) row.institutionId = patch.institutionId
      if (patch.contact !== undefined) row.contact = patch.contact
      if (patch.notes !== undefined) row.notes = patch.notes
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'updated', externalTeamEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: EXTERNAL_TEAM_RESOURCE_KIND,
      labelKey: 'groups.audit.external_teams.update',
      fallback: 'Change an external team',
      after: externalTeamSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeExternalTeamReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ExternalTeamSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing external team snapshot for undo')
    const row = await authorizeExternalTeamReplay(ctx, before.id)
    await undoRestore(ctx, row, before, restoreExternalTeam, externalTeamEvents, 'updated')
  },
}

const deleteExternalTeamCommand: CommandHandler<Record<string, unknown>, ExternalTeamCommandResult> = {
  id: 'groups.external_teams.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'groups.external_teams.delete', async (em) => {
      const authorized = await authorizeScoped(existingSpec(externalTeamDeleteSchema, loader(ctx)), rawInput, ctx, em)
      const row = authorized.entity as ExternalTeam
      const before = externalTeamSnapshot(row)
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitGroupsSideEffects(ctx, result.entity, 'deleted', externalTeamEvents)
    return result
  },
  buildLog: ({ result }) =>
    groupsLog({
      result,
      resourceKind: EXTERNAL_TEAM_RESOURCE_KIND,
      labelKey: 'groups.audit.external_teams.delete',
      fallback: 'Delete an external team',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeExternalTeamReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ExternalTeamSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing external team snapshot for undo')
    const row = await authorizeExternalTeamReplay(ctx, before.id, true)
    await undoRestore(ctx, row, before, restoreExternalTeam, externalTeamEvents, 'created')
  },
}

registerCommand(createExternalTeamCommand)
registerCommand(updateExternalTeamCommand)
registerCommand(deleteExternalTeamCommand)
