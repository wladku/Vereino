// `activities.occurrences.report_absence` and `activities.occurrences.assign_coach` (club spec glossary *Substitution*,
// API rows `POST /api/activities/occurrences/{id}/absence` and `…/{id}/coach`, REQ-008, DD-12; README M-04, B-15, flow
// F-03 path A; E06-S13 #95):
// - the session's assigned coach — matched through their own person (`self` on the target's `personId`), so a coach of
//   another group or of the same group who is not assigned gets 403 — reports an absence for a planned session that
//   has not started: the session is left without a coach and goes to "Needing a coach"; the coordinators of its
//   section are notified after commit (`subscribers/notify-coach-needed.ts`);
// - the coordinator of the section or the club administrator assigns a coach of the club to a planned session: 409
//   `occurrence_coach_conflict` with the overlapping sessions when the coach is busy at that time (also for a forged
//   request the dialog would not send); the assigned coach is notified after commit
//   (`subscribers/notify-substitution-assigned.ts`);
// - each writes one append-only entry (`activities_substitution_entries`: previous and new coach, kind, encrypted
//   reason, who decided and in which role). Neither is undoable: the history is never rewritten, and a correction is
//   a new assignment (giving the session back to its own coach records `coach_restored`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { z } from 'zod'
import type { GrantKind, ScopeTarget } from '@vereino/core'
import { authorizeScoped, foundationErrors, scopeDenialCode, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Occurrence, SubstitutionEntry } from '../data/entities'
import { lockSchedule } from '../data/queries'
import { occurrenceAbsenceSchema, occurrenceAssignCoachSchema } from '../data/validators'
import { absenceProblem, assignmentKind, reasonOrNull, type SubstitutionKind } from '../lib/substitutions'
import { coachCandidateIds } from '../services/directory'
import { busySessionsOf, substitutionStepsOf } from '../services/substitutions'
import { OCCURRENCE_RESOURCE_KIND, occurrenceSnapshot, type OccurrenceSnapshot } from './occurrences'
import {
  PLAN_KINDS,
  activitiesLog,
  emitAfterCommit,
  inWriteTransaction,
  scheduleTarget,
  selfPersonId,
  trustedTenantId,
  type ActivitiesCommandResult,
} from './shared'

/** Only the session's assigned coach reports their own absence. */
export const ABSENCE_KINDS: readonly GrantKind[] = ['self']

export type SubstitutionCommandResult = ActivitiesCommandResult<Occurrence, OccurrenceSnapshot> & {
  entryId: string
  kind: SubstitutionKind
  previousCoachPersonId: string | null
  newCoachPersonId: string | null
}

function loadOccurrence(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Occurrence | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Occurrence, { id, tenantId, deletedAt: null }, lock)
  }
}

/** The scope target of an absence: the session and its assigned coach (none once the coach is gone). */
function absenceTarget(row: Occurrence): ScopeTarget {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    personId: row.coachPersonId ?? null,
  }
}

/** Writes the entry; the decider is the caller's own person (an account without one was refused by the scope). */
async function appendEntry(
  em: EntityManager,
  row: Occurrence,
  entry: {
    kind: SubstitutionKind
    previousCoachPersonId: string | null
    newCoachPersonId: string | null
    reason: string | null
    decidedByPersonId: string
    actingRole: string
  },
): Promise<SubstitutionEntry> {
  const created = em.create(SubstitutionEntry, {
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    occurrenceId: row.id,
    ...entry,
  })
  em.persist(created)
  await em.flush()
  return created
}

function substitutionLog(labelKey: string, fallback: string) {
  return ({ result }: { result: SubstitutionCommandResult }) =>
    activitiesLog({
      result,
      resourceKind: OCCURRENCE_RESOURCE_KIND,
      labelKey,
      fallback,
      after: occurrenceSnapshot(result.entity),
      parent: { resourceKind: 'activities.activity', resourceId: result.entity.activityId },
      context: { substitutionEntryId: result.entryId, kind: result.kind },
    })
}

async function emitCoachEvent(
  eventId: 'activities.occurrence.coach_unassigned' | 'activities.occurrence.coach_changed',
  result: SubstitutionCommandResult,
  ctx: CommandRuntimeContext,
): Promise<void> {
  const row = result.entity
  await emitAfterCommit(
    eventId,
    { tenantId: row.tenantId, organizationId: row.organizationId },
    {
      id: row.id,
      activityId: row.activityId,
      groupId: row.groupId,
      sectionId: row.sectionId,
      substitutionEntryId: result.entryId,
      kind: result.kind,
      previousCoachPersonId: result.previousCoachPersonId,
      newCoachPersonId: result.newCoachPersonId,
      actorUserId: ctx.auth?.sub ?? null,
      updatedAt: row.updatedAt.toISOString(),
    },
  )
}

const reportAbsenceCommand: CommandHandler<Record<string, unknown>, SubstitutionCommandResult> = {
  id: 'activities.occurrences.report_absence',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    const load = loadOccurrence(ctx)
    const result = await inWriteTransaction(ctx, 'activities.occurrences.report_absence', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: occurrenceAbsenceSchema,
          resourceKind: OCCURRENCE_RESOURCE_KIND,
          allowedKinds: ABSENCE_KINDS,
          loadTarget: (parsed: z.output<typeof occurrenceAbsenceSchema>, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => absenceTarget(entity as Occurrence),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Occurrence
      const problem = absenceProblem(row, now)
      if (problem === 'not_planned') await activitiesErrors.throw('occurrence_not_planned', { status: row.status })
      if (problem === 'started') await activitiesErrors.throw('absence_after_start')
      const coachPersonId = row.coachPersonId as string
      const before = occurrenceSnapshot(row)
      row.coachPersonId = null
      row.updatedAt = now
      const entry = await appendEntry(em, row, {
        kind: 'absence_reported',
        previousCoachPersonId: coachPersonId,
        newCoachPersonId: null,
        reason: reasonOrNull(authorized.parsed.reason),
        // `self` matched the coach's own person, so the decider is that person.
        decidedByPersonId: coachPersonId,
        actingRole: 'coach',
      })
      return {
        entity: row,
        actingRole: 'coach' as const,
        before,
        entryId: entry.id,
        kind: entry.kind,
        previousCoachPersonId: coachPersonId,
        newCoachPersonId: null,
      }
    })
    await emitCoachEvent('activities.occurrence.coach_unassigned', result, ctx)
    return result
  },
  buildLog: substitutionLog('activities.audit.occurrences.reportAbsence', 'Report a coach absence'),
}

const assignCoachCommand: CommandHandler<Record<string, unknown>, SubstitutionCommandResult> = {
  id: 'activities.occurrences.assign_coach',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const load = loadOccurrence(ctx)
    const result = await inWriteTransaction(ctx, 'activities.occurrences.assign_coach', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: occurrenceAssignCoachSchema,
          resourceKind: OCCURRENCE_RESOURCE_KIND,
          allowedKinds: PLAN_KINDS,
          loadTarget: (parsed: z.output<typeof occurrenceAssignCoachSchema>, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => scheduleTarget(entity as Occurrence, (entity as Occurrence).id),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Occurrence
      const { coachPersonId, reason } = authorized.parsed
      const decidedByPersonId = selfPersonId(authorized.scope)
      if (!decidedByPersonId) return foundationErrors.throw(scopeDenialCode(authorized.scope))
      if (row.status !== 'planned') await activitiesErrors.throw('occurrence_not_planned', { status: row.status })
      const previousCoachPersonId = row.coachPersonId ?? null
      if (coachPersonId === previousCoachPersonId) await activitiesErrors.throw('occurrence_coach_unchanged')
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      // A coach of the club on the session's date: an active coach role or a coach / assistant membership.
      if (!(await coachCandidateIds(ctx.container, scope, row.occurrenceDate, em)).includes(coachPersonId)) {
        await activitiesErrors.throw('activities_reference_invalid', { field: 'coachPersonId' })
      }
      // One schedule writer at a time, so two assignments cannot both find the coach free.
      await lockSchedule(em, row.organizationId)
      const busy = await busySessionsOf(em, scope, row, [coachPersonId])
      if (busy.length > 0) {
        await activitiesErrors.throw('occurrence_coach_conflict', {
          conflicts: [
            {
              key: row.id,
              startAt: row.startAt.toISOString(),
              endAt: row.endAt.toISOString(),
              kind: 'coach',
              sessions: busy.map((session) => ({
                id: session.id,
                activityId: session.activityId,
                activityName: session.activityName,
                groupId: session.groupId,
                placeId: session.placeId,
                startAt: session.startAt.toISOString(),
                endAt: session.endAt.toISOString(),
              })),
              blocks: [],
            },
          ],
        })
      }
      const steps = (await substitutionStepsOf(em, scope, [row.id])).get(row.id) ?? []
      const kind = assignmentKind(steps, previousCoachPersonId, coachPersonId)
      const before = occurrenceSnapshot(row)
      row.coachPersonId = coachPersonId
      row.updatedAt = new Date()
      const entry = await appendEntry(em, row, {
        kind,
        previousCoachPersonId,
        newCoachPersonId: coachPersonId,
        reason: reasonOrNull(reason),
        decidedByPersonId,
        actingRole: authorized.actingRole,
      })
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before,
        entryId: entry.id,
        kind,
        previousCoachPersonId,
        newCoachPersonId: coachPersonId,
      }
    })
    await emitCoachEvent('activities.occurrence.coach_changed', result, ctx)
    return result
  },
  buildLog: substitutionLog('activities.audit.occurrences.assignCoach', 'Assign a session coach'),
}

registerCommand(reportAbsenceCommand)
registerCommand(assignCoachCommand)
