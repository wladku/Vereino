// `facilities.maintenance.create|update|complete` and `facilities.place_maintainers.create|delete` (facilities spec
// glossary *Maintenance task*, DD-36, the CRUD and `facilities.maintenance.complete` rows of *API*; REQ-022; #128).
// - Tasks are planned by the club administrator (club-wide) or by a person who maintains the place (the
//   `maintenance_planner` grant with the place ids of `facilities_place_maintainers`); any other caller answers 403.
// - A task with a window and status `planned` occupies the slot like a closure: creating or moving it takes the
//   occupancy lock (DD-43), and after the commit, in transactions of their own, flags the sessions, rentals and
//   internal bookings under it `needs_reschedule` (`services/reschedule.ts`) and emits `facilities.maintenance.scheduled`.
//   A window may overlap existing entries (it moves them); it is not limited by the opening hours.
// - Cancelling is `status: 'cancelled'` through the update; a done or cancelled task is final (409 `invalid_transition`)
//   and no longer editable (409 `maintenance_task_closed`). Completing sets `done_at`; a recurring task — by date or by
//   use — then gets its next instance in the same series: the next due date, or the usage counter from `done_at`.
// - The commands are not undoable: a task is cancelled, not deleted (no deletion of done tasks), and the flags of a
//   window stay for the coordinator to resolve, as for a closure.
// - Adding or removing a place maintainer commits the row and then calls `people.roleSync.syncPerson`, which adds or
//   removes the derived role `vereino_maintenance_planner` (V-13); a failed sync is repaired by `people:sync-role-expiry`.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { findActingRole, type GrantKind, type Scope } from '@vereino/core'
import { assertTransition, authorizeScoped, foundationErrors } from '@/modules/foundation'
import type { PeopleRoleSync } from '../../people/di'
import { MaintenanceTask, PlaceMaintainer } from '../data/entities'
import {
  maintenanceCompleteSchema,
  maintenanceTaskCreateSchema,
  maintenanceTaskUpdateSchema,
  placeMaintainerCreateSchema,
  placeMaintainerDeleteSchema,
} from '../data/validators'
import { facilitiesErrors } from '../api/errors'
import type { RescheduleCounts } from '../lib/closures'
import {
  maintenanceTaskProblem,
  maintenanceTransitions,
  maintenanceWindowChanged,
  nextDueDate,
  parseMaintenanceRecurrence,
  taskOccupies,
  type MaintenanceTaskShape,
} from '../lib/maintenance'
import { personNames, type FacilitiesScope } from '../services/directory'
import { sendMaintenanceReminders, type MaintenanceReminderCounts } from '../services/maintenance'
import { flagUnderWindow } from '../services/reschedule'
import {
  MANAGE_KINDS,
  assertPlaces,
  emitAfterCommit,
  facilitiesLog,
  facilityTarget,
  inWriteTransaction,
  lockForOccupancy,
  rowLoader,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

const logger = createLogger('facilities').child({ component: 'place-maintainers' })

export const MAINTENANCE_RESOURCE_KIND = 'facilities.maintenance_task'
export const PLACE_MAINTAINER_RESOURCE_KIND = 'facilities.place_maintainer'

/** Who plans and completes maintenance: the club administrator, or the maintainer of the task's place (DD-36). */
export const MAINTENANCE_KINDS_ALLOWED: readonly GrantKind[] = ['club_admin', 'maintenance_planner']

const PEOPLE_ROLE_SYNC = 'people.roleSync'

export type MaintenanceTaskSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  kind: MaintenanceTask['kind']
  responsible: MaintenanceTask['responsible']
  scheduleType: MaintenanceTask['scheduleType']
  startsAt: string | null
  endsAt: string | null
  dueDate: string | null
  recurrenceRule: string | null
  usageHoursThreshold: number | null
  usageCountedFrom: string | null
  seriesId: string | null
  status: MaintenanceTask['status']
  plannedByPersonId: string
  doneAt: string | null
  doneByPersonId: string | null
  cost: number | null
}

export type MaintenanceCommandResult = FacilitiesCommandResult<MaintenanceTask, MaintenanceTaskSnapshot> & {
  flagged: RescheduleCounts
  /** The next instance a completion created (a recurring task). */
  nextTaskId?: string | null
}

export function maintenanceSnapshot(row: MaintenanceTask): MaintenanceTaskSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    kind: row.kind,
    responsible: row.responsible,
    scheduleType: row.scheduleType,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    dueDate: row.dueDate ?? null,
    recurrenceRule: row.recurrenceRule ?? null,
    usageHoursThreshold: row.usageHoursThreshold ?? null,
    usageCountedFrom: row.usageCountedFrom?.toISOString() ?? null,
    seriesId: row.seriesId ?? null,
    status: row.status,
    plannedByPersonId: row.plannedByPersonId,
    doneAt: row.doneAt?.toISOString() ?? null,
    doneByPersonId: row.doneByPersonId ?? null,
    cost: row.cost ?? null,
  }
}

const NONE_FLAGGED: RescheduleCounts = { sessions: 0, rentals: 0, bookings: 0 }

/** The caller's person (the `self` grant); a user without a linked person cannot plan (403 `scope_unlinked`). */
async function actorPersonId(scope: Scope): Promise<string> {
  const personId = scope.find((grant) => grant.kind === 'self')?.ids?.[0]
  if (!personId) return foundationErrors.throw('scope_unlinked')
  return personId
}

function shapeOf(row: Pick<MaintenanceTask, 'scheduleType'> & Partial<MaintenanceTask>): MaintenanceTaskShape {
  return {
    scheduleType: row.scheduleType,
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    dueDate: row.dueDate ?? null,
    recurrenceRule: row.recurrenceRule ?? null,
    usageHoursThreshold: row.usageHoursThreshold ?? null,
  }
}

async function assertShape(shape: MaintenanceTaskShape): Promise<void> {
  const problem = maintenanceTaskProblem(shape)
  if (problem) await throwFieldError(problem.code, problem.field)
}

/** A task as a scope target: its place, so a maintainer's grant matches the places they maintain. */
function taskTarget(row: { id: string; tenantId: string; organizationId: string; placeId: string }) {
  return { ...facilityTarget(row), placeId: row.placeId }
}

async function emitTask(row: MaintenanceTask, action: 'created' | 'updated'): Promise<void> {
  await emitAfterCommit(
    `facilities.maintenance_task.${action}`,
    { tenantId: row.tenantId, organizationId: row.organizationId },
    { id: row.id, placeId: row.placeId },
  )
}

/** After the commit: `facilities.maintenance.scheduled` and the reschedule flags under the window (DD-43). */
async function scheduleWindow(ctx: CommandRuntimeContext, row: MaintenanceTask): Promise<RescheduleCounts> {
  if (!taskOccupies(row)) return NONE_FLAGGED
  const scope: FacilitiesScope = { tenantId: row.tenantId, organizationId: row.organizationId }
  await emitAfterCommit('facilities.maintenance.scheduled', scope, { id: row.id, placeId: row.placeId })
  return flagUnderWindow(ctx.container, scope, row.placeId, { start: row.startsAt as Date, end: row.endsAt as Date })
}

const createMaintenanceCommand: CommandHandler<Record<string, unknown>, MaintenanceCommandResult> = {
  id: 'facilities.maintenance.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'facilities.maintenance.create', async (em) => {
      // A window adds occupancy: the organization's occupancy lock comes before any row (DD-43).
      await lockForOccupancy(ctx, em)
      const authorized = await authorizeScoped(
        {
          input: maintenanceTaskCreateSchema,
          resourceKind: MAINTENANCE_RESOURCE_KIND,
          allowedKinds: MAINTENANCE_KINDS_ALLOWED,
          resolveTarget: (parsed, _entity, scope) => taskTarget({ id, ...scope, placeId: parsed.placeId }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const personId = await actorPersonId(authorized.scope)
      const fields = {
        scheduleType: parsed.scheduleType,
        startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
        endsAt: parsed.endsAt ? new Date(parsed.endsAt) : null,
        dueDate: parsed.dueDate ?? null,
        recurrenceRule: parsed.recurrenceRule ?? null,
        usageHoursThreshold: parsed.usageHoursThreshold ?? null,
      }
      await assertShape(fields)
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      const usage = parsed.scheduleType === 'usage_hours'
      const row = em.create(MaintenanceTask, {
        id,
        ...scope,
        placeId: parsed.placeId,
        kind: parsed.kind,
        responsible: parsed.responsible,
        ...fields,
        recurrenceRule: parsed.scheduleType === 'date_recurring' ? fields.recurrenceRule : null,
        usageHoursThreshold: usage ? fields.usageHoursThreshold : null,
        usageCountedFrom: usage ? (parsed.usageCountedFrom ? new Date(parsed.usageCountedFrom) : now) : null,
        seriesId: parsed.scheduleType === 'one_off' ? null : id,
        status: 'planned',
        plannedByPersonId: personId,
        cost: parsed.cost ?? null,
        notes: parsed.notes ?? null,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitTask(result.entity, 'created')
    const flagged = await scheduleWindow(ctx, result.entity)
    return { ...result, flagged }
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: MAINTENANCE_RESOURCE_KIND,
      labelKey: 'facilities.audit.maintenance.create',
      fallback: 'Plan maintenance',
      after: maintenanceSnapshot(result.entity),
      context: { flagged: result.flagged },
    }),
}

const existingTaskSpec = <TSchema extends typeof maintenanceTaskUpdateSchema | typeof maintenanceCompleteSchema>(
  ctx: CommandRuntimeContext,
  input: TSchema,
) => ({
  input,
  resourceKind: MAINTENANCE_RESOURCE_KIND,
  allowedKinds: MAINTENANCE_KINDS_ALLOWED,
  loadTarget: (parsed: { id: string }, em: EntityManager, lock: Parameters<ReturnType<typeof rowLoader>>[2]) =>
    rowLoader(ctx, MaintenanceTask)(em, parsed.id, lock),
  resolveTarget: (_parsed: unknown, entity: MaintenanceTask | null) => taskTarget(entity as MaintenanceTask),
})

const updateMaintenanceCommand: CommandHandler<Record<string, unknown>, MaintenanceCommandResult> = {
  id: 'facilities.maintenance.update',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.maintenance.update', async (em) => {
      await lockForOccupancy(ctx, em)
      const authorized = await authorizeScoped(existingTaskSpec(ctx, maintenanceTaskUpdateSchema), rawInput, ctx, em)
      const row = authorized.entity as MaintenanceTask
      const patch = authorized.parsed
      const before = maintenanceSnapshot(row)
      if (row.status !== 'planned') {
        if (patch.status === 'cancelled') await assertTransition(maintenanceTransitions, row.status, 'cancelled')
        await facilitiesErrors.throw('maintenance_task_closed')
      }
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      if (patch.placeId !== undefined && patch.placeId !== row.placeId) {
        await assertPlaces(ctx, em, scope, [patch.placeId])
        // A maintainer moves a task only to another place they maintain.
        const target = taskTarget({
          id: row.id,
          tenantId: row.tenantId,
          organizationId: row.organizationId,
          placeId: patch.placeId,
        })
        if (!findActingRole(authorized.scope, MAINTENANCE_KINDS_ALLOWED, target)) {
          await foundationErrors.throw('scope_denied')
        }
        row.placeId = patch.placeId
      }
      if (patch.kind !== undefined) row.kind = patch.kind
      if (patch.responsible !== undefined) row.responsible = patch.responsible
      if (patch.startsAt !== undefined) row.startsAt = patch.startsAt ? new Date(patch.startsAt) : null
      if (patch.endsAt !== undefined) row.endsAt = patch.endsAt ? new Date(patch.endsAt) : null
      if (patch.dueDate !== undefined) row.dueDate = patch.dueDate
      if (patch.recurrenceRule !== undefined && row.scheduleType === 'date_recurring') {
        row.recurrenceRule = patch.recurrenceRule
      }
      if (patch.usageHoursThreshold !== undefined && row.scheduleType === 'usage_hours') {
        row.usageHoursThreshold = patch.usageHoursThreshold
      }
      if (patch.cost !== undefined) row.cost = patch.cost
      if (patch.notes !== undefined) row.notes = patch.notes
      if (patch.status === 'cancelled') {
        await assertTransition(maintenanceTransitions, row.status, 'cancelled')
        row.status = 'cancelled'
      } else {
        await assertShape(shapeOf(row))
      }
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitTask(result.entity, 'updated')
    const before = result.before
    const moved = maintenanceWindowChanged(
      {
        placeId: before.placeId,
        startsAt: before.startsAt ? new Date(before.startsAt) : null,
        endsAt: before.endsAt ? new Date(before.endsAt) : null,
      },
      {
        placeId: result.entity.placeId,
        startsAt: result.entity.startsAt ?? null,
        endsAt: result.entity.endsAt ?? null,
      },
    )
    const flagged = moved ? await scheduleWindow(ctx, result.entity) : NONE_FLAGGED
    return { ...result, flagged }
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: MAINTENANCE_RESOURCE_KIND,
      labelKey:
        result.entity.status === 'cancelled'
          ? 'facilities.audit.maintenance.cancel'
          : 'facilities.audit.maintenance.update',
      fallback: result.entity.status === 'cancelled' ? 'Cancel maintenance' : 'Change maintenance',
      after: maintenanceSnapshot(result.entity),
      context: { flagged: result.flagged },
    }),
}

const completeMaintenanceCommand: CommandHandler<Record<string, unknown>, MaintenanceCommandResult> = {
  id: 'facilities.maintenance.complete',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    let next: MaintenanceTask | null = null
    const result = await inWriteTransaction(ctx, 'facilities.maintenance.complete', async (em) => {
      const authorized = await authorizeScoped(existingTaskSpec(ctx, maintenanceCompleteSchema), rawInput, ctx, em)
      const row = authorized.entity as MaintenanceTask
      const parsed = authorized.parsed
      const before = maintenanceSnapshot(row)
      await assertTransition(maintenanceTransitions, row.status, 'done')
      const personId = await actorPersonId(authorized.scope)
      const doneAt = parsed.doneAt ? new Date(parsed.doneAt) : now
      row.status = 'done'
      row.doneAt = doneAt
      row.doneByPersonId = personId
      if (parsed.cost !== undefined) row.cost = parsed.cost
      if (parsed.notes !== undefined) row.notes = parsed.notes
      row.updatedAt = now
      // A recurring task continues in its series: the next due date, or the hours counted again from `doneAt`.
      const rule = row.recurrenceRule ? parseMaintenanceRecurrence(row.recurrenceRule) : null
      const recurringByDate = row.scheduleType === 'date_recurring' && rule && row.dueDate
      if (recurringByDate || row.scheduleType === 'usage_hours') {
        next = em.create(MaintenanceTask, {
          id: randomUUID(),
          tenantId: row.tenantId,
          organizationId: row.organizationId,
          placeId: row.placeId,
          kind: row.kind,
          responsible: row.responsible,
          scheduleType: row.scheduleType,
          startsAt: null,
          endsAt: null,
          dueDate: recurringByDate && rule && row.dueDate ? nextDueDate(row.dueDate, rule) : null,
          recurrenceRule: row.recurrenceRule ?? null,
          usageHoursThreshold: row.usageHoursThreshold ?? null,
          usageCountedFrom: row.scheduleType === 'usage_hours' ? doneAt : null,
          seriesId: row.seriesId ?? row.id,
          status: 'planned',
          plannedByPersonId: personId,
        })
        em.persist(next)
      }
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    const scope = { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId }
    await emitAfterCommit('facilities.maintenance.completed', scope, {
      id: result.entity.id,
      placeId: result.entity.placeId,
    })
    const created = next as MaintenanceTask | null
    if (created) await emitTask(created, 'created')
    return { ...result, flagged: NONE_FLAGGED, nextTaskId: created?.id ?? null }
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: MAINTENANCE_RESOURCE_KIND,
      labelKey: 'facilities.audit.maintenance.complete',
      fallback: 'Complete maintenance',
      after: maintenanceSnapshot(result.entity),
      context: { nextTaskId: result.nextTaskId ?? null },
    }),
}

// --- Place maintainers (managed by the club administrator, `facilities.manage`) ---

export type PlaceMaintainerSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  personId: string
}

export type PlaceMaintainerCommandResult = FacilitiesCommandResult<PlaceMaintainer, PlaceMaintainerSnapshot>

function maintainerSnapshot(row: PlaceMaintainer): PlaceMaintainerSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    personId: row.personId,
  }
}

/** After the commit: the person's derived role follows the assignments (DD-36); a failure waits for the nightly sync. */
async function syncMaintainerRoles(ctx: CommandRuntimeContext, row: PlaceMaintainer): Promise<void> {
  if (!ctx.container.hasRegistration(PEOPLE_ROLE_SYNC)) return
  const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  try {
    await ctx.container.resolve<PeopleRoleSync>(PEOPLE_ROLE_SYNC).syncPerson(scope, row.personId)
  } catch (error: unknown) {
    logger.warn('The maintainer role sync failed; people:sync-role-expiry repairs it', { ...scope, err: error })
  }
}

const createMaintainerCommand: CommandHandler<Record<string, unknown>, PlaceMaintainerCommandResult> = {
  id: 'facilities.place_maintainers.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'facilities.place_maintainers.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: placeMaintainerCreateSchema,
          resourceKind: PLACE_MAINTAINER_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => facilityTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      if (!(await personNames(ctx.container, scope, [parsed.personId], em)).has(parsed.personId)) {
        await throwFieldError('maintainer_person_invalid', 'personId')
      }
      const existing = await em.findOne(
        PlaceMaintainer,
        { ...scope, placeId: parsed.placeId, personId: parsed.personId },
        { fields: ['id'] },
      )
      if (existing) await throwFieldError('maintainer_exists', 'personId')
      const row = em.create(PlaceMaintainer, {
        id,
        ...scope,
        placeId: parsed.placeId,
        personId: parsed.personId,
        assignedByPersonId: authorized.scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null,
        assignedAt: new Date(),
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    const row = result.entity
    await emitAfterCommit(
      'facilities.place_maintainer.created',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, placeId: row.placeId },
    )
    await syncMaintainerRoles(ctx, row)
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: PLACE_MAINTAINER_RESOURCE_KIND,
      labelKey: 'facilities.audit.placeMaintainers.create',
      fallback: 'Assign a place maintainer',
      after: maintainerSnapshot(result.entity),
    }),
}

const deleteMaintainerCommand: CommandHandler<Record<string, unknown>, PlaceMaintainerCommandResult> = {
  id: 'facilities.place_maintainers.delete',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.place_maintainers.delete', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: placeMaintainerDeleteSchema,
          resourceKind: PLACE_MAINTAINER_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          // An assignment carries no version the panel edits: removing it needs no lock token.
          lock: 'none',
          loadTarget: (parsed, em2, lock) => rowLoader(ctx, PlaceMaintainer)(em2, parsed.id, lock),
          resolveTarget: (_parsed, entity) => facilityTarget(entity as PlaceMaintainer),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as PlaceMaintainer
      const before = maintainerSnapshot(row)
      // A hard delete ends the scope at once and lets the same person be assigned again (the unique key).
      em.remove(row)
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    const row = result.entity
    await emitAfterCommit(
      'facilities.place_maintainer.deleted',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, placeId: row.placeId },
    )
    await syncMaintainerRoles(ctx, row)
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: PLACE_MAINTAINER_RESOURCE_KIND,
      labelKey: 'facilities.audit.placeMaintainers.delete',
      fallback: 'Remove a place maintainer',
      after: null,
    }),
}

// --- The daily reminders (`facilities:maintenance-reminders`, DD-46) ---

const remindersSchema = z.object({ now: z.iso.datetime({ offset: true }).optional() }).strict()

export type MaintenanceRemindersJobResult = { now: string; counts: MaintenanceReminderCounts }

/**
 * `facilities.maintenance.send_reminders`: the date and usage reminders due now, each at most once (the dispatch key).
 * `now` comes from the operator CLI (`--now`); a worker never sets it.
 */
const sendRemindersCommand: CommandHandler<Record<string, unknown>, MaintenanceRemindersJobResult> = {
  id: 'facilities.maintenance.send_reminders',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const authorized = await inWriteTransaction(ctx, 'facilities.maintenance.send_reminders', (em) =>
      authorizeScoped(
        {
          input: remindersSchema,
          resourceKind: 'facilities.organization',
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, trusted) => ({ id: trusted.organizationId, ...trusted }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      ),
    )
    const at = authorized.parsed.now ? new Date(authorized.parsed.now) : new Date()
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const counts = await sendMaintenanceReminders(ctx.container, scope, at)
    return { now: at.toISOString(), counts }
  },
}

registerCommand(sendRemindersCommand)
registerCommand(createMaintenanceCommand)
registerCommand(updateMaintenanceCommand)
registerCommand(completeMaintenanceCommand)
registerCommand(createMaintainerCommand)
registerCommand(deleteMaintainerCommand)
