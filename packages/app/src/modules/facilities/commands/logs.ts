// `facilities.logs.create|update` (facilities spec *Data Models* → `facilities_logs`, the CRUD row for `/logs`,
// REQ-016; M-12 "Open facility", today's groups, "Close facility"; B-27; #126): one log per place and day, written
// with `facilities.log.write`. A log for a day that has not begun answers 422 `log_date_invalid`, a second log for the
// day 409 `log_exists`; opening needs the condition before, closing an opened log and the condition after (422); the
// groups present each name a live session or rental of the place, its ancestors or descendants, once (422). A log is
// editable until the end of the next day in the club time zone, then by the club administrator only (403
// `log_edit_closed`). The club administrator is the only writer until the facility attendant role (with its place
// scope) arrives — it needs a `people` migration that is not approved yet (#126). Not undoable: a log is corrected by
// another update, and the audit log keeps each version.
import { randomUUID } from 'node:crypto'
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { calendarDateInZone, type GrantKind, type Scope } from '@vereino/core'
import { authorizeScoped, foundationErrors } from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { FacilityLog, Rental } from '../data/entities'
import { logCreateSchema, logUpdateSchema } from '../data/validators'
import {
  groupReferences,
  groupsPresentValid,
  logDateAllowed,
  logEditable,
  logStateProblem,
  type GroupPresent,
} from '../lib/logs'
import { clubTimeZone, sessionsByIds, type FacilitiesScope } from '../services/directory'
import { placeFamilyIds } from '../services/occupancy'
import {
  assertPlaces,
  emitAfterCommit,
  facilitiesLog,
  facilityTarget,
  inWriteTransaction,
  rowLoader,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

export const LOG_RESOURCE_KIND = 'facilities.facility_log'

/** Who writes the log: the club administrator (the facility attendant arrives with its place scope, #126). */
export const LOG_KINDS: readonly GrantKind[] = ['club_admin']

export type LogSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  logDate: string
  operatorPersonId: string
  openedAt: string | null
  closedAt: string | null
  groupsPresent: GroupPresent[]
}

export type LogCommandResult = FacilitiesCommandResult<FacilityLog, LogSnapshot>

/** The audit snapshot: times and groups — never the condition texts or the encrypted remarks. */
export function logSnapshot(row: FacilityLog): LogSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    logDate: row.logDate,
    operatorPersonId: row.operatorPersonId,
    openedAt: row.openedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    groupsPresent: [...row.groupsPresent],
  }
}

/** The caller's person (the `self` grant); a user without a linked person cannot write the log (403). */
async function callerPersonId(scope: Scope): Promise<string> {
  const personId = scope.find((grant) => grant.kind === 'self')?.ids?.[0]
  if (!personId) return foundationErrors.throw('scope_unlinked')
  return personId
}

type LogFields = {
  openedAt?: string | null
  closedAt?: string | null
  conditionBefore?: string | null
  conditionAfter?: string | null
  groupsPresent?: GroupPresent[]
  remarks?: string | null
}

const instant = (value: string | null): Date | null => (value === null ? null : new Date(value))

/** Copies the given fields onto the row; an empty text clears the field. */
function applyFields(row: FacilityLog, fields: LogFields): void {
  if (fields.openedAt !== undefined) row.openedAt = instant(fields.openedAt)
  if (fields.closedAt !== undefined) row.closedAt = instant(fields.closedAt)
  if (fields.conditionBefore !== undefined) row.conditionBefore = fields.conditionBefore || null
  if (fields.conditionAfter !== undefined) row.conditionAfter = fields.conditionAfter || null
  if (fields.remarks !== undefined) row.remarks = fields.remarks || null
  if (fields.groupsPresent !== undefined) {
    row.groupsPresent = fields.groupsPresent.map((group) => ({
      occurrenceId: group.occurrenceId ?? null,
      rentalId: group.rentalId ?? null,
      headcount: group.headcount,
      adultSupervisorPresent: group.adultSupervisorPresent,
    }))
  }
}

/** 403 `log_edit_closed` unless the log's day is still open for the caller. */
async function assertEditable(
  ctx: CommandRuntimeContext,
  scope: FacilitiesScope,
  logDate: string,
  actingRole: string,
): Promise<void> {
  const today = calendarDateInZone(new Date(), await clubTimeZone(ctx.container, scope))
  if (!logEditable(logDate, today, actingRole === 'club_admin')) await facilitiesErrors.throw('log_edit_closed')
}

/** The state rules (422) and the groups: each once, each a live session or rental of the place family (422). */
async function assertContent(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FacilitiesScope,
  row: FacilityLog,
): Promise<void> {
  const problem = logStateProblem({
    openedAt: row.openedAt ?? null,
    closedAt: row.closedAt ?? null,
    conditionBefore: row.conditionBefore ?? null,
    conditionAfter: row.conditionAfter ?? null,
  })
  if (problem) await throwFieldError(problem.code, problem.field)
  if (!groupsPresentValid(row.groupsPresent)) await throwFieldError('log_groups_invalid', 'groupsPresent')
  const { occurrenceIds, rentalIds } = groupReferences(row.groupsPresent)
  if (occurrenceIds.length === 0 && rentalIds.length === 0) return
  const family = new Set(await placeFamilyIds(ctx.container, scope, row.placeId, em))
  const sessions = occurrenceIds.length > 0 ? await sessionsByIds(ctx.container, scope, occurrenceIds, em) : []
  const rentals =
    rentalIds.length > 0
      ? await em.find(Rental, { ...scope, deletedAt: null, id: { $in: rentalIds } }, { fields: ['id', 'placeId'] })
      : []
  const known = new Set([
    ...sessions.filter((session) => family.has(session.placeId)).map((session) => session.id),
    ...rentals.filter((rental) => family.has(rental.placeId)).map((rental) => rental.id),
  ])
  const missing = [...occurrenceIds, ...rentalIds].filter((id) => !known.has(id))
  if (missing.length > 0) await throwFieldError('facilities_reference_invalid', 'groupsPresent', { ids: missing })
}

const createLogCommand: CommandHandler<Record<string, unknown>, LogCommandResult> = {
  id: 'facilities.logs.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'facilities.logs.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: logCreateSchema,
          resourceKind: LOG_RESOURCE_KIND,
          allowedKinds: LOG_KINDS,
          resolveTarget: (parsed, _entity, scope) => ({ ...facilityTarget({ id, ...scope }), placeId: parsed.placeId }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const personId = await callerPersonId(authorized.scope)
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      const today = calendarDateInZone(new Date(), await clubTimeZone(ctx.container, scope))
      if (!logDateAllowed(parsed.logDate, today)) await throwFieldError('log_date_invalid', 'logDate')
      await assertEditable(ctx, scope, parsed.logDate, authorized.actingRole)
      const existing = await em.findOne(
        FacilityLog,
        { ...scope, placeId: parsed.placeId, logDate: parsed.logDate },
        { fields: ['id', 'updatedAt'] },
      )
      if (existing) {
        await throwFieldError('log_exists', 'logDate', {
          id: existing.id,
          updatedAt: existing.updatedAt.toISOString(),
        })
      }
      const row = em.create(FacilityLog, {
        id,
        ...scope,
        placeId: parsed.placeId,
        logDate: parsed.logDate,
        operatorPersonId: personId,
      })
      applyFields(row, parsed)
      await assertContent(ctx, em, scope, row)
      em.persist(row)
      // A concurrent first write of the same day passes the check above; the unique key answers it with 409 too.
      try {
        await em.flush()
      } catch (error: unknown) {
        if (error instanceof UniqueConstraintViolationException) await throwFieldError('log_exists', 'logDate')
        throw error
      }
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    const row = result.entity
    await emitAfterCommit(
      'facilities.log.created',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, placeId: row.placeId },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: LOG_RESOURCE_KIND,
      labelKey: 'facilities.audit.logs.create',
      fallback: 'Start the facility log',
      after: logSnapshot(result.entity),
    }),
}

const updateLogCommand: CommandHandler<Record<string, unknown>, LogCommandResult> = {
  id: 'facilities.logs.update',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.logs.update', async (em) => {
      const load = rowLoader(ctx, FacilityLog)
      const authorized = await authorizeScoped(
        {
          input: logUpdateSchema,
          resourceKind: LOG_RESOURCE_KIND,
          allowedKinds: LOG_KINDS,
          loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => {
            const row = entity as FacilityLog
            return { ...facilityTarget(row), placeId: row.placeId }
          },
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as FacilityLog
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      const before = logSnapshot(row)
      await assertEditable(ctx, scope, row.logDate, authorized.actingRole)
      applyFields(row, authorized.parsed)
      await assertContent(ctx, em, scope, row)
      // The operator is who ran the day: set on the first write; a later correction is recorded in the audit log.
      await callerPersonId(authorized.scope)
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    const row = result.entity
    await emitAfterCommit(
      'facilities.log.updated',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, placeId: row.placeId },
    )
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: LOG_RESOURCE_KIND,
      labelKey: 'facilities.audit.logs.update',
      fallback: 'Update the facility log',
      after: logSnapshot(result.entity),
    }),
}

registerCommand(createLogCommand)
registerCommand(updateLogCommand)
