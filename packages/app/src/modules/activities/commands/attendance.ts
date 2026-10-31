// `activities.attendance.declare`, `activities.attendance.guardian_decide` and the job `activities.attendance.expire`
// (club spec glossary *Declaration*, *Declaration policy*; REQ-007; D-006, D-026; TEST-009, TEST-011; foundation II
// P-25; #32):
// - a participant (the `self` grant), a guardian of the participant, a coach of the group, the coordinator of the
//   section or the club administrator declares `yes` / `no` / `unknown` for one session, until its start; what is
//   declared follows the club's `declaration_kinds` (an `absence_only` session refuses `yes`, 422); a minor declaring
//   for themself follows the policy — `immediate` is final, `guardian_confirm` waits for the guardian until the time
//   limit, `guardian_only` is refused (403);
// - the guardian approves or rejects a pending declaration (409 when it is not pending);
// - the expiry job moves the pending declarations past their limit with `advanceWhere` to the status the policy copied
//   onto the row, and only the rows it changed get an event — a retry re-emits nothing.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import {
  enforceCommandOptimisticLock,
  enforceCommandOptimisticLockWithGuards,
} from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { z } from 'zod'
import type { ActingRole, GrantKind } from '@vereino/core'
import {
  advanceWhere,
  assertTransition,
  authorizeScoped,
  foundationErrors,
  type TargetLock,
} from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, Attendance, AttendancePolicy, Occurrence } from '../data/entities'
import { attendanceDeclareSchema, expireConfirmationsSchema, guardianDecisionSchema } from '../data/validators'
import {
  TIMEOUT_DEFAULTS,
  declarationOutcome,
  declarationSource,
  declarationTransitions,
  declarationWindow,
  declaredAllowedForKind,
  isMinorOn,
  resolvePolicy,
  timeoutStatus,
  type ActualAttendance,
  type Declared,
  type DeclarationSource,
  type DeclarationStatus,
  type PolicyRow,
  type TimeoutDefault,
} from '../lib/policy'
import { attendanceSettings, findPersons, rosterOn } from '../services/directory'
import {
  activitiesLog,
  emitAfterCommit,
  inWriteTransaction,
  selfPersonId,
  trustedTenantId,
  type ActivitiesCommandResult,
} from './shared'

const logger = createLogger('activities').child({ component: 'attendance' })

export const ATTENDANCE_RESOURCE_KIND = 'activities.attendance'

/** Who declares (club spec API table): the participant, a guardian, a coach of the group, the coordinator, the administrator. */
export const DECLARE_KINDS: readonly GrantKind[] = ['self', 'guardian', 'coach', 'coordinator', 'club_admin']

/** Who decides on a pending declaration: a guardian of the ward (club spec API table). */
export const DECIDE_KINDS: readonly GrantKind[] = ['guardian']

export type AttendanceSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  occurrenceId: string
  personId: string
  declared: Declared
  declaredByPersonId: string | null
  declaredAt: string | null
  declarationStatus: DeclarationStatus
  guardianDecidedAt: string | null
  pendingUntil: string | null
  timeoutOutcome: TimeoutDefault | null
  actual: ActualAttendance | null
  markedByPersonId: string | null
  markedAsRole: string | null
  source: DeclarationSource
  /** The row's lock token after the write; an undo refuses (409) when the row changed since. */
  updatedAt: string
}

/** What the guardians of the participant are told after a minor's own declaration (club spec *Events* row). */
export type GuardianNotice = 'ward_declared' | 'guardian_confirmation_needed' | null

export type DeclareCommandResult = ActivitiesCommandResult<Attendance, AttendanceSnapshot> & {
  created: boolean
  guardianNotice: GuardianNotice
}

export type DecideCommandResult = ActivitiesCommandResult<Attendance, AttendanceSnapshot>

export function attendanceSnapshot(row: Attendance): AttendanceSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    occurrenceId: row.occurrenceId,
    personId: row.personId,
    declared: row.declared,
    declaredByPersonId: row.declaredByPersonId ?? null,
    declaredAt: row.declaredAt?.toISOString() ?? null,
    declarationStatus: row.declarationStatus,
    guardianDecidedAt: row.guardianDecidedAt?.toISOString() ?? null,
    pendingUntil: row.pendingUntil?.toISOString() ?? null,
    timeoutOutcome: row.timeoutOutcome ?? null,
    actual: row.actual ?? null,
    markedByPersonId: row.markedByPersonId ?? null,
    markedAsRole: row.markedAsRole ?? null,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function restoreAttendance(row: Attendance, before: AttendanceSnapshot): void {
  row.declared = before.declared
  row.declaredByPersonId = before.declaredByPersonId
  row.declaredAt = before.declaredAt ? new Date(before.declaredAt) : null
  row.declarationStatus = before.declarationStatus
  row.guardianDecidedAt = before.guardianDecidedAt ? new Date(before.guardianDecidedAt) : null
  row.pendingUntil = before.pendingUntil ? new Date(before.pendingUntil) : null
  row.timeoutOutcome = before.timeoutOutcome
  row.actual = before.actual
  row.markedByPersonId = before.markedByPersonId
  row.markedAsRole = before.markedAsRole
  row.source = before.source
  row.deletedAt = null
}

/** The policies of the club as the resolver reads them. */
export function policyRows(rows: readonly AttendancePolicy[]): PolicyRow[] {
  return rows.map((row) => ({
    scope: row.scope,
    groupId: row.groupId ?? null,
    activityType: row.activityType ?? null,
    minorDeclarationMode: row.minorDeclarationMode,
    confirmTimeoutHours: row.confirmTimeoutHours,
    defaultAfterTimeout: row.defaultAfterTimeout,
  }))
}

type Scope = { tenantId: string; organizationId: string }

/** The session a declaration or decision concerns must still take declarations. */
async function assertDeclarationsOpen(occurrence: Occurrence, now: Date): Promise<void> {
  const window = declarationWindow(occurrence, now)
  if (window === 'not_planned') await activitiesErrors.throw('occurrence_not_planned', { status: occurrence.status })
  if (window === 'closed') await activitiesErrors.throw('declaration_closed')
}

function loadOccurrence(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Occurrence | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Occurrence, { id, tenantId, deletedAt: null }, lock)
  }
}

function loadAttendance(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Attendance | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Attendance, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

/** Acting roles that declare as staff: they also need `activities.coach` (club spec API row: "or `activities.coach`"). */
const STAFF_ROLES: readonly ActingRole[] = ['coach', 'coordinator', 'club_admin']

/**
 * A staff declaration needs the `activities.coach` feature on top of the record scope: a `coach` grant comes from an
 * assistant membership too, which alone does not make a person staff (403 `scope_denied`).
 */
async function assertStaffMayDeclare(ctx: CommandRuntimeContext, actingRole: ActingRole, scope: Scope): Promise<void> {
  if (!STAFF_ROLES.includes(actingRole)) return
  const userId = ctx.auth?.sub
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  if (!userId || !(await rbac.userHasAllFeatures(userId, ['activities.coach'], scope))) {
    await foundationErrors.throw('scope_denied')
  }
}

/**
 * An undo restores a declaration only while the session takes declarations and only when the row is still what the
 * command wrote (409 `optimistic_lock_conflict` otherwise — a newer declaration or decision wins).
 */
async function assertUndoable(em: EntityManager, row: Attendance, after: AttendanceSnapshot | null | undefined) {
  const scope: Scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  const occurrence = await em.findOne(Occurrence, { id: row.occurrenceId, ...scope, deletedAt: null })
  if (!occurrence) throw new Error('[internal] a declaration without its session: ' + row.id)
  await assertDeclarationsOpen(occurrence, new Date())
  if (after?.updatedAt) {
    enforceCommandOptimisticLock({
      resourceKind: ATTENDANCE_RESOURCE_KIND,
      resourceId: row.id,
      current: row.updatedAt,
      expected: after.updatedAt,
    })
  }
}

/** A declaration's scope target: the person (self, guardian), the group and session (coach), the section (coordinator). */
function declarationTarget(occurrence: Occurrence, personId: string) {
  return {
    id: occurrence.id,
    tenantId: occurrence.tenantId,
    organizationId: occurrence.organizationId,
    sectionId: occurrence.sectionId,
    groupId: occurrence.groupId,
    occurrenceId: occurrence.id,
    personId,
  }
}

const declareCommand: CommandHandler<Record<string, unknown>, DeclareCommandResult> = {
  id: 'activities.attendance.declare',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'activities.attendance.declare', async (em) => {
      const load = loadOccurrence(ctx)
      const authorized = await authorizeScoped(
        {
          input: attendanceDeclareSchema,
          resourceKind: ATTENDANCE_RESOURCE_KIND,
          allowedKinds: DECLARE_KINDS,
          loadTarget: (parsed, txEm, lock) => load(txEm, parsed.occurrenceId, lock),
          resolveTarget: (parsed, entity) => declarationTarget(entity as Occurrence, parsed.personId),
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
      )
      const occurrence = authorized.entity as Occurrence
      const { parsed, actingRole } = authorized
      const scope: Scope = { tenantId: occurrence.tenantId, organizationId: occurrence.organizationId }
      // Participation first: a session of another group answers the same 422 whatever its status, so the route is no
      // oracle for other groups' sessions.
      const roster = await rosterOn(ctx.container, scope, occurrence.groupId, occurrence.occurrenceDate, em)
      if (!roster.some((member) => member.personId === parsed.personId && member.role === 'participant')) {
        await activitiesErrors.throw('declaration_not_participant')
      }
      await assertStaffMayDeclare(ctx, actingRole, scope)
      await assertDeclarationsOpen(occurrence, now)
      const activity = await em.findOne(Activity, { id: occurrence.activityId, ...scope }, { fields: ['id', 'type'] })
      if (!activity) throw new Error('[internal] a session without its activity: ' + occurrence.id)
      const settings = await attendanceSettings(ctx.container, scope)
      const kind = settings.declarationKinds[activity.type] ?? 'confirm'
      if (!declaredAllowedForKind(kind, parsed.declared)) {
        await activitiesErrors.throw('declaration_kind_absence_only', { kind })
      }
      let isMinor = false
      if (actingRole === 'self') {
        const person = (await findPersons(ctx.container, scope, [parsed.personId], em)).get(parsed.personId)
        isMinor = isMinorOn(person?.birthDate ?? null, occurrence.occurrenceDate)
      }
      const policies = policyRows(await em.find(AttendancePolicy, { ...scope, deletedAt: null }))
      const policy = resolvePolicy(policies, {
        groupId: occurrence.groupId,
        activityType: activity.type,
        isAway: false,
      })
      const outcome = declarationOutcome({ actingRole, isMinor, policy, now, startsAt: occurrence.startAt })
      if (outcome.kind === 'guardian_only') await activitiesErrors.throw('declaration_guardian_only')

      let row = await em.findOne(Attendance, {
        ...scope,
        occurrenceId: occurrence.id,
        personId: parsed.personId,
        deletedAt: null,
      })
      // A client that read a declaration sends its lock token: a change made meanwhile (another guardian, the ward)
      // answers 409 instead of being overwritten silently (club spec *Data Models*: "upsert with version").
      if (row) {
        await enforceCommandOptimisticLockWithGuards(ctx.container, {
          resourceKind: ATTENDANCE_RESOURCE_KIND,
          resourceId: row.id,
          current: row.updatedAt,
          expected: null,
          request: ctx.request ?? null,
        })
      }
      const before = row ? attendanceSnapshot(row) : null
      const created = row === null
      row ??= em.create(Attendance, { ...scope, occurrenceId: occurrence.id, personId: parsed.personId })
      row.declared = parsed.declared
      row.declaredByPersonId = selfPersonId(authorized.scope)
      row.declaredAt = now
      row.declarationStatus = outcome.kind === 'pending_guardian' ? 'pending_guardian' : 'final'
      row.pendingUntil = outcome.kind === 'pending_guardian' ? outcome.pendingUntil : null
      row.timeoutOutcome = outcome.kind === 'pending_guardian' ? outcome.timeoutOutcome : null
      row.guardianDecidedAt = null
      row.source = declarationSource(actingRole)
      row.updatedAt = now
      em.persist(row)
      const guardianNotice: GuardianNotice =
        actingRole === 'self' && isMinor
          ? outcome.kind === 'pending_guardian'
            ? 'guardian_confirmation_needed'
            : 'ward_declared'
          : null
      return { entity: row, actingRole, before, created, guardianNotice }
    })
    await emitDeclared(result.entity, result.actingRole, result.guardianNotice, ctx.auth?.sub ?? null)
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ATTENDANCE_RESOURCE_KIND,
      labelKey: 'activities.audit.attendance.declare',
      fallback: 'Declare attendance',
      after: attendanceSnapshot(result.entity),
      parent: { resourceKind: 'activities.occurrence', resourceId: result.entity.occurrenceId },
      context: { created: result.created, declared: result.entity.declared, status: result.entity.declarationStatus },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeDeclarationReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const { row, actingRole } = await authorizeDeclarationReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    await assertUndoable(em, row, logEntry.snapshotAfter as AttendanceSnapshot | null | undefined)
    const before = logEntry.snapshotBefore as AttendanceSnapshot | null | undefined
    const now = new Date()
    if (before?.id) restoreAttendance(row, before)
    else row.deletedAt = now
    row.updatedAt = now
    await em.flush()
    await emitDeclared(row, actingRole, null, ctx.auth?.sub ?? null, true)
  },
}

/**
 * The undo of a declaration or a decision is authorized like a declaration: the person, a guardian, a coach of the
 * group, the coordinator or the administrator — through the session the row belongs to.
 */
async function authorizeDeclarationReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
): Promise<{ row: Attendance; actingRole: ActingRole }> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] attendance replay needs the replay transaction and the id')
  const tenantId = trustedTenantId(ctx)
  const row = tenantId ? await em.findOne(Attendance, { id, tenantId }) : null
  if (!row) throw new Error('[internal] attendance row missing for replay: ' + id)
  const load = loadOccurrence(ctx)
  const { actingRole } = await authorizeScoped(
    {
      input: z.object({ occurrenceId: z.uuid(), personId: z.uuid() }),
      resourceKind: ATTENDANCE_RESOURCE_KIND,
      allowedKinds: DECLARE_KINDS,
      loadTarget: (parsed, txEm, lock) => load(txEm, parsed.occurrenceId, lock),
      resolveTarget: (parsed, entity) => declarationTarget(entity as Occurrence, parsed.personId),
      lock: 'none',
    },
    { occurrenceId: row.occurrenceId, personId: row.personId },
    ctx,
    em,
    { mode: 'replay' },
  )
  return { row, actingRole }
}

async function emitDeclared(
  row: Attendance,
  actingRole: ActingRole,
  guardianNotice: GuardianNotice,
  actorUserId: string | null,
  undo = false,
): Promise<void> {
  await emitAfterCommit(
    'activities.attendance.declared',
    { tenantId: row.tenantId, organizationId: row.organizationId },
    {
      id: row.id,
      occurrenceId: row.occurrenceId,
      personId: row.personId,
      declared: row.declared,
      declarationStatus: row.declarationStatus,
      actingRole,
      guardianNotice,
      actorUserId,
      undo,
    },
  )
}

async function emitDecided(
  row: Attendance,
  byTimeout: boolean,
  actorUserId: string | null,
  undo = false,
): Promise<void> {
  await emitAfterCommit(
    'activities.attendance.guardian_decided',
    { tenantId: row.tenantId, organizationId: row.organizationId },
    {
      id: row.id,
      occurrenceId: row.occurrenceId,
      personId: row.personId,
      declared: row.declared,
      declarationStatus: row.declarationStatus,
      byTimeout,
      actorUserId,
      undo,
    },
  )
}

const guardianDecideCommand: CommandHandler<Record<string, unknown>, DecideCommandResult> = {
  id: 'activities.attendance.guardian_decide',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'activities.attendance.guardian_decide', async (em) => {
      const load = loadAttendance(ctx)
      const authorized = await authorizeScoped(
        {
          input: guardianDecisionSchema,
          resourceKind: ATTENDANCE_RESOURCE_KIND,
          allowedKinds: DECIDE_KINDS,
          loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => {
            const row = entity as Attendance
            return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId, personId: row.personId }
          },
          // The guardian decides on the answer they saw: a re-declaration meanwhile moves the lock token (409).
          lock: 'updated_at',
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Attendance
      const scope: Scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      const occurrence = await em.findOne(Occurrence, { id: row.occurrenceId, ...scope, deletedAt: null })
      if (!occurrence) throw new Error('[internal] a declaration without its session: ' + row.id)
      await assertDeclarationsOpen(occurrence, now)
      if (row.declarationStatus !== 'pending_guardian') {
        await activitiesErrors.throw('guardian_decision_not_pending', { status: row.declarationStatus })
      }
      const to: DeclarationStatus = authorized.parsed.approve ? 'final' : 'rejected_by_guardian'
      await assertTransition(declarationTransitions, row.declarationStatus, to)
      const before = attendanceSnapshot(row)
      row.declarationStatus = to
      row.guardianDecidedAt = now
      row.pendingUntil = null
      row.timeoutOutcome = null
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitDecided(result.entity, false, ctx.auth?.sub ?? null)
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ATTENDANCE_RESOURCE_KIND,
      labelKey: 'activities.audit.attendance.guardian_decide',
      fallback: 'Decide on a declaration',
      after: attendanceSnapshot(result.entity),
      parent: { resourceKind: 'activities.occurrence', resourceId: result.entity.occurrenceId },
      context: { status: result.entity.declarationStatus },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeDeclarationReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const { row } = await authorizeDeclarationReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    await assertUndoable(em, row, logEntry.snapshotAfter as AttendanceSnapshot | null | undefined)
    const before = logEntry.snapshotBefore as AttendanceSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing declaration snapshot for undo')
    restoreAttendance(row, before)
    row.updatedAt = new Date()
    await em.flush()
    await emitDecided(row, false, ctx.auth?.sub ?? null, true)
  },
}

// --- The expiry job ---

export type ExpireCounts = { processed: number; skipped: number; failed: number }

export type ExpireJobResult = {
  tenantId: string
  organizationId: string
  actingRole: ActingRole
  now: string
  counts: ExpireCounts
  /** The declarations the run moved (ids only). */
  changedIds: string[]
}

const expireCommand: CommandHandler<Record<string, unknown>, ExpireJobResult> = {
  id: 'activities.attendance.expire',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const authorized = await inWriteTransaction(ctx, 'activities.attendance.expire.authorize', (em) =>
      authorizeScoped(
        {
          input: expireConfirmationsSchema,
          resourceKind: 'activities.organization',
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      ),
    )
    const scope: Scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const now = authorized.parsed.now ? new Date(authorized.parsed.now) : new Date()
    const counts: ExpireCounts = { processed: 0, skipped: 0, failed: 0 }
    const changedIds: string[] = []
    logger.info('Guardian confirmation expiry started', { ...scope, now: now.toISOString() })
    for (const outcome of TIMEOUT_DEFAULTS) {
      try {
        const changed = await inWriteTransaction(ctx, 'activities.attendance.expire.' + outcome, async (em) => {
          const due = await em.count(Attendance, {
            ...scope,
            deletedAt: null,
            declarationStatus: 'pending_guardian',
            pendingUntil: { $lte: now },
            timeoutOutcome: outcome,
          })
          const ids = await advanceWhere(em, Attendance, {
            transitions: declarationTransitions,
            statusField: 'declarationStatus',
            where: { ...scope, deletedAt: null, pendingUntil: { $lte: now }, timeoutOutcome: outcome },
            from: 'pending_guardian',
            to: timeoutStatus(outcome),
            set: { updatedAt: now, guardianDecidedAt: now, pendingUntil: null, timeoutOutcome: null },
          })
          counts.skipped += due - ids.length
          return ids
        })
        counts.processed += changed.length
        changedIds.push(...changed)
      } catch (error: unknown) {
        counts.failed += 1
        logger.warn('Guardian confirmation expiry failed for one outcome; the next run retries it', {
          ...scope,
          outcome,
          err: error,
        })
      }
    }
    if (changedIds.length > 0) {
      const em = ctx.container.resolve<EntityManager>('em').fork()
      const rows = await em.find(Attendance, { ...scope, id: { $in: changedIds } })
      for (const row of rows) await emitDecided(row, true, null)
    }
    logger.info('Guardian confirmation expiry finished', { ...scope, ...counts })
    return { ...scope, actingRole: authorized.actingRole, now: now.toISOString(), counts, changedIds }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('activities.audit.jobs.expire', 'Expire guardian confirmations'),
      resourceKind: 'activities.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: { actingRole: result.actingRole, now: result.now, ...result.counts },
    }
  },
}

registerCommand(declareCommand)
registerCommand(guardianDecideCommand)
registerCommand(expireCommand)
