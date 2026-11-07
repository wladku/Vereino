// `facilities.entry_bans.create` (facilities spec *Data Models* → `facilities_entry_bans`, REQ-016; #122): the club
// administrator bans an institution or a person from a place for a period; a rental for that renter on the place (or
// a sub-place) in the period answers 409 `entry_ban_active`. An end before the start answers 422
// `entry_ban_period_invalid`, an unknown place or subject 422 `facilities_reference_invalid`. Not undoable: a ban is
// revoked, never deleted — the revocation, the incident link and the pages arrive with E08-S06 (#126).
import { randomUUID } from 'node:crypto'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { authorizeScoped } from '@/modules/foundation'
import { EntryBan } from '../data/entities'
import { entryBanCreateSchema } from '../data/validators'
import { institutionNames, personNames } from '../services/directory'
import {
  MANAGE_KINDS,
  assertPlaces,
  emitAfterCommit,
  facilitiesLog,
  facilityTarget,
  inWriteTransaction,
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
      const row = em.create(EntryBan, {
        id,
        ...scope,
        placeId: parsed.placeId,
        subjectType: parsed.subjectType,
        subjectId: parsed.subjectId,
        startsOn: parsed.startsOn,
        endsOn: parsed.endsOn ?? null,
        reason: parsed.reason,
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

registerCommand(createEntryBanCommand)
