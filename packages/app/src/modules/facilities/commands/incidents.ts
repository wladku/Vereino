// `facilities.incidents.create|update` (facilities spec *Data Models* → `facilities_incidents`, the CRUD row for
// `/incidents`, REQ-016, §6 of the regulations; M-12 "Report incident", B-27; #126): an incident is reported with
// `facilities.log.write` — the place, the time (not in the future, 422 `incident_time_future`), the kind, a
// description of 10–2000 characters (422 `incident_description_length`), the people involved and the actions taken;
// the reporter is the caller's person. With `facilities.incidents.manage` the administrator or the attendant later
// records further actions and links the `communication` case it is followed in. There is no delete command: an
// incident is evidence and is never deleted. Like the log, written by the facility attendant within their places (the
// `facility_operator` grant, #126) and by the club administrator.
import { randomUUID } from 'node:crypto'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import type { GrantKind } from '@vereino/core'
import { authorizeScoped, foundationErrors } from '@/modules/foundation'
import { Incident } from '../data/entities'
import { incidentCreateSchema, incidentUpdateSchema } from '../data/validators'
import { incidentDescriptionValid, incidentTimeAllowed, normalizedActions, type IncidentAction } from '../lib/incidents'
import {
  assertPlaces,
  emitAfterCommit,
  facilitiesLog,
  inWriteTransaction,
  placeTarget,
  rowLoader,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'
import { LOG_KINDS } from './logs'

export const INCIDENT_RESOURCE_KIND = 'facilities.incident'

/** Who reports and later changes an incident: the log writers — the attendant within their places, the administrator. */
export const INCIDENT_REPORT_KINDS: readonly GrantKind[] = LOG_KINDS

export type IncidentSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  occurredAt: string
  reportedByPersonId: string
  kind: Incident['kind']
  actionTaken: IncidentAction[]
  threadId: string | null
}

export type IncidentCommandResult = FacilitiesCommandResult<Incident, IncidentSnapshot>

/** The audit snapshot: never the encrypted description or the people involved. */
export function incidentSnapshot(row: Incident): IncidentSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    occurredAt: row.occurredAt.toISOString(),
    reportedByPersonId: row.reportedByPersonId,
    kind: row.kind,
    actionTaken: [...row.actionTaken],
    threadId: row.threadId ?? null,
  }
}

const createIncidentCommand: CommandHandler<Record<string, unknown>, IncidentCommandResult> = {
  id: 'facilities.incidents.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'facilities.incidents.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: incidentCreateSchema,
          resourceKind: INCIDENT_RESOURCE_KIND,
          allowedKinds: INCIDENT_REPORT_KINDS,
          resolveTarget: (parsed, _entity, scope) => placeTarget({ id, ...scope, placeId: parsed.placeId }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const personId = authorized.scope.find((grant) => grant.kind === 'self')?.ids?.[0]
      if (!personId) return foundationErrors.throw('scope_unlinked')
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      if (!incidentDescriptionValid(parsed.description)) {
        await throwFieldError('incident_description_length', 'description')
      }
      const occurredAt = new Date(parsed.occurredAt)
      if (!incidentTimeAllowed(occurredAt, now)) await throwFieldError('incident_time_future', 'occurredAt')
      const row = em.create(Incident, {
        id,
        ...scope,
        placeId: parsed.placeId,
        occurredAt,
        reportedByPersonId: personId,
        kind: parsed.kind,
        description: parsed.description.trim(),
        involved: parsed.involved || null,
        actionTaken: normalizedActions(parsed.actionTaken ?? []),
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    const row = result.entity
    await emitAfterCommit(
      'facilities.incident.created',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, placeId: row.placeId },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: INCIDENT_RESOURCE_KIND,
      labelKey: 'facilities.audit.incidents.create',
      fallback: 'Report an incident',
      after: incidentSnapshot(result.entity),
    }),
}

const updateIncidentCommand: CommandHandler<Record<string, unknown>, IncidentCommandResult> = {
  id: 'facilities.incidents.update',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.incidents.update', async (em) => {
      const load = rowLoader(ctx, Incident)
      const authorized = await authorizeScoped(
        {
          input: incidentUpdateSchema,
          resourceKind: INCIDENT_RESOURCE_KIND,
          allowedKinds: INCIDENT_REPORT_KINDS,
          loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => placeTarget(entity as Incident),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Incident
      const before = incidentSnapshot(row)
      const { parsed } = authorized
      if (parsed.actionTaken !== undefined) row.actionTaken = normalizedActions(parsed.actionTaken)
      if (parsed.threadId !== undefined) row.threadId = parsed.threadId
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    const row = result.entity
    await emitAfterCommit(
      'facilities.incident.updated',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, placeId: row.placeId },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: INCIDENT_RESOURCE_KIND,
      labelKey: 'facilities.audit.incidents.update',
      fallback: 'Update an incident',
      after: incidentSnapshot(result.entity),
    }),
}

registerCommand(createIncidentCommand)
registerCommand(updateIncidentCommand)
