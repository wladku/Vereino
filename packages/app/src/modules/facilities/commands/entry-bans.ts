// `facilities.entry_bans.create` (facilities spec *Data Models* → `facilities_entry_bans`, REQ-016; #122): the club
// administrator bans an institution or a person from a place for a period; a rental for that renter on the place (or
// a sub-place) in the period answers 409 `entry_ban_active`. An end before the start answers 422
// `entry_ban_period_invalid`, an unknown place or subject 422 `facilities_reference_invalid`. Since E08-S06 (#126) a
// ban names the incident it follows (422 `facilities_reference_invalid` for an unknown one) and the person who issued
// it, and `facilities.entry_bans.revoke` ends it (`revoked_at`; a second revocation answers 409 `entry_ban_revoked`).
// Not undoable: a ban is revoked, never deleted, and a revoked ban is not restored — a new ban is issued instead.
import { randomUUID } from 'node:crypto'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { authorizeScoped } from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { EntryBan, Incident } from '../data/entities'
import { entryBanCreateSchema, entryBanRevokeSchema } from '../data/validators'
import { institutionNames, personNames } from '../services/directory'
import {
  MANAGE_KINDS,
  assertPlaces,
  emitAfterCommit,
  existingSpec,
  facilitiesLog,
  facilityTarget,
  inWriteTransaction,
  rowLoader,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

export const ENTRY_BAN_RESOURCE_KIND = 'facilities.entry_ban'

export type EntryBanSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  subjectType: EntryBan['subjectType']
  subjectId: string
  startsOn: string
  endsOn: string | null
  incidentId: string | null
  issuedByPersonId: string | null
  revokedAt: string | null
}

export type EntryBanCommandResult = FacilitiesCommandResult<EntryBan, EntryBanSnapshot>

/** The audit snapshot, without the encrypted reason. */
export function entryBanSnapshot(row: EntryBan): EntryBanSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? null,
    incidentId: row.incidentId ?? null,
    issuedByPersonId: row.issuedByPersonId ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}

const createEntryBanCommand: CommandHandler<Record<string, unknown>, EntryBanCommandResult> = {
  id: 'facilities.entry_bans.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'facilities.entry_bans.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: entryBanCreateSchema,
          resourceKind: ENTRY_BAN_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => facilityTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      if (parsed.endsOn && parsed.endsOn < parsed.startsOn) await throwFieldError('entry_ban_period_invalid', 'endsOn')
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      const subjects =
        parsed.subjectType === 'institution'
          ? await institutionNames(ctx.container, scope, [parsed.subjectId], em)
          : await personNames(ctx.container, scope, [parsed.subjectId], em)
      if (!subjects.has(parsed.subjectId)) await throwFieldError('facilities_reference_invalid', 'subjectId')
      if (parsed.incidentId) {
        const incident = await em.count(Incident, {
          ...scope,
          deletedAt: null,
          id: parsed.incidentId,
          placeId: parsed.placeId,
        })
        if (incident === 0) await throwFieldError('facilities_reference_invalid', 'incidentId')
      }
      const row = em.create(EntryBan, {
        id,
        ...scope,
        placeId: parsed.placeId,
        subjectType: parsed.subjectType,
        subjectId: parsed.subjectId,
        startsOn: parsed.startsOn,
        endsOn: parsed.endsOn ?? null,
        reason: parsed.reason,
        incidentId: parsed.incidentId ?? null,
        issuedByPersonId: authorized.scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    const row = result.entity
    await emitAfterCommit(
      'facilities.entry_ban.created',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: ENTRY_BAN_RESOURCE_KIND,
      labelKey: 'facilities.audit.entryBans.create',
      fallback: 'Issue an entry ban',
      after: entryBanSnapshot(result.entity),
    }),
}

const revokeEntryBanCommand: CommandHandler<Record<string, unknown>, EntryBanCommandResult> = {
  id: 'facilities.entry_bans.revoke',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.entry_bans.revoke', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(entryBanRevokeSchema, ENTRY_BAN_RESOURCE_KIND, rowLoader(ctx, EntryBan)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as EntryBan
      const before = entryBanSnapshot(row)
      if (row.revokedAt) await facilitiesErrors.throw('entry_ban_revoked')
      const now = new Date()
      row.revokedAt = now
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    const row = result.entity
    await emitAfterCommit(
      'facilities.entry_ban.revoked',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: ENTRY_BAN_RESOURCE_KIND,
      labelKey: 'facilities.audit.entryBans.revoke',
      fallback: 'Revoke an entry ban',
      after: entryBanSnapshot(result.entity),
    }),
}

registerCommand(createEntryBanCommand)
registerCommand(revokeEntryBanCommand)
