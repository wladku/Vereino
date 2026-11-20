// The `activities` departure contributor (people life-cycle spec REQ-L04, DD-L04, the `activities` row of the
// contributor table, *Hand-over choice*; phase L5, #307): `people` declares the contract (`people/services/departure.ts`)
// and reads it with `hasRegistration`; `activities` registers it in `di.ts` under `people.departure.activities`.
// - preview: per leaving person and group, the planned sessions they lead that start after the last day (in the club's
//   zone) and the active activities whose default coach they are — each group needs a hand-over choice;
// - apply: from the day after the last day each such session gets the chosen coach (a coach of the club on that day,
//   else 422 `departure_handover_coach_invalid`) or none, with one substitution entry per session (`substitute_assigned`
//   or `absence_reported`; Q-L11: nothing is posted to the group threads), and each activity the chosen default coach;
// - undo: restores each coach and default coach only where the departure's value is still in place. Substitution
//   entries are append-only (the `foundation` guard refuses a delete), so the undo writes a correcting
//   `coach_restored` entry instead of deleting the departure's entry;
// - after the commit: `activities.occurrence.coach_changed|coach_unassigned` per entry and `activities.activity.updated`
//   per activity, as `activities.occurrences.assign_coach|report_absence` and an activity edit emit them.
// Reads and writes use the caller's EntityManager, inside the departure's transaction.
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { addDays, zonedInstant } from '@vereino/core'
import type {
  DepartureChange,
  DepartureContributor,
  DepartureHandOverNeed,
  DepartureSubject,
} from '../../people/services/departure'
import { activitiesErrors } from '../api/errors'
import { emitAfterCommit } from '../commands/shared'
import { Activity, Attendance, Occurrence, SubstitutionEntry } from '../data/entities'
import { handOverEntryKind, handOverNeeds, handOverTarget, restorable } from '../lib/departure-handover'
import type { GroupDirectoryEntry } from '../../groups/services/group-directory'
import { clubClock, coachCandidateIds, findGroups } from './directory'
import { substitutionStepsOf } from './substitutions'

/** The token `people` reads (`departureContributorToken('activities')` in `people/services/departure.ts`). */
export const ACTIVITIES_DEPARTURE_CONTRIBUTOR = 'people.departure.activities'

type Scope = { tenantId: string; organizationId: string }

type SessionUndo = { id: string; previous: string; next: string | null }
type ActivityUndo = { id: string; previous: string; next: string | null }
type ActivitiesSnapshot = {
  sessions: SessionUndo[]
  activities: ActivityUndo[]
  decidedByPersonId: string | null
  actingRole: string
}

function scopeOf(subject: DepartureSubject): Scope {
  return { tenantId: subject.tenantId, organizationId: subject.organizationId }
}

/** The planned sessions the leaving persons lead that start on the day after the last day or later. */
async function ledSessions(
  em: EntityManager,
  container: AwilixContainer,
  subject: DepartureSubject,
  lock: boolean,
): Promise<Occurrence[]> {
  const { timeZone } = await clubClock(container, scopeOf(subject))
  const from = zonedInstant(addDays(subject.lastDay, 1), '00:00', timeZone)
  return em.find(
    Occurrence,
    {
      ...scopeOf(subject),
      deletedAt: null,
      status: 'planned',
      coachPersonId: { $in: [...subject.personIds] },
      startAt: { $gte: from },
    },
    { orderBy: { startAt: 'asc', id: 'asc' }, ...(lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {}) },
  )
}

/** The live activities whose default coach is a leaving person and that may still run after the last day. */
async function ledActivities(em: EntityManager, subject: DepartureSubject, lock: boolean): Promise<Activity[]> {
  return em.find(
    Activity,
    {
      ...scopeOf(subject),
      deletedAt: null,
      isActive: true,
      defaultCoachPersonId: { $in: [...subject.personIds] },
      $or: [{ endsOn: null }, { endsOn: { $gt: subject.lastDay } }],
    },
    { orderBy: { id: 'asc' }, ...(lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {}) },
  )
}

function appendEntry(
  em: EntityManager,
  row: Occurrence,
  entry: Pick<SubstitutionEntry, 'kind' | 'decidedByPersonId' | 'actingRole'> & {
    previousCoachPersonId: string | null
    newCoachPersonId: string | null
  },
): SubstitutionEntry {
  const created = em.create(SubstitutionEntry, {
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    occurrenceId: row.id,
    reason: null,
    ...entry,
  })
  em.persist(created)
  return created
}

export function createDepartureContribution(container: AwilixContainer): DepartureContributor {
  return {
    async preview(em, subject) {
      // One query at a time: `em` may be the departure's transaction, a single connection.
      const sessions = await ledSessions(em, container, subject, false)
      const activities = await ledActivities(em, subject, false)
      const needs = handOverNeeds(
        sessions.map((row) => ({ coachPersonId: row.coachPersonId as string, groupId: row.groupId })),
        activities.map((row) => ({ coachPersonId: row.defaultCoachPersonId as string, groupId: row.groupId })),
      )
      const groups =
        needs.length > 0
          ? await findGroups(
              container,
              scopeOf(subject),
              needs.map((need) => need.groupId),
              em,
            )
          : new Map<string, GroupDirectoryEntry>()
      const handOvers: DepartureHandOverNeed[] = needs.map((need) => ({
        module: 'activities',
        ...need,
        groupName: groups.get(need.groupId)?.name ?? null,
      }))
      return { items: [], warnings: [], blockers: [], handOvers }
    },

    async apply(em, subject, choices) {
      const scope = scopeOf(subject)
      const sessions = await ledSessions(em, container, subject, true)
      const activities = await ledActivities(em, subject, true)
      const snapshot: ActivitiesSnapshot = {
        sessions: [],
        activities: [],
        decidedByPersonId: choices.decidedByPersonId,
        actingRole: choices.actingRole,
      }
      const changes: DepartureChange[] = []
      if (sessions.length === 0 && activities.length === 0) return { snapshot, changes }
      // The chosen coaches must be coaches of the club on the day after the last day (an active coach role, or a coach
      // or assistant membership): the administrator may name any of them (*Hand-over choice*).
      const targets = [...new Set(choices.handOver.flatMap((entry) => (entry.toPersonId ? [entry.toPersonId] : [])))]
      if (targets.length > 0) {
        const coaches = new Set(await coachCandidateIds(container, scope, addDays(subject.lastDay, 1), em))
        const invalid = choices.handOver.filter((entry) => entry.toPersonId && !coaches.has(entry.toPersonId))
        if (invalid.length > 0) {
          await activitiesErrors.throw('departure_handover_coach_invalid', {
            groupIds: invalid.map((entry) => entry.groupId),
          })
        }
      }
      const decidedByPersonId = choices.decidedByPersonId
      if (!decidedByPersonId) throw new Error('[internal] a hand-over needs the deciding person')
      const steps = await substitutionStepsOf(
        em,
        scope,
        sessions.map((row) => row.id),
      )
      const now = new Date()
      for (const row of sessions) {
        const next = handOverTarget(choices.handOver, row.groupId)
        if (next === undefined) continue
        const previous = row.coachPersonId as string
        const entry = appendEntry(em, row, {
          kind: handOverEntryKind(steps.get(row.id) ?? [], previous, next),
          previousCoachPersonId: previous,
          newCoachPersonId: next,
          decidedByPersonId,
          actingRole: choices.actingRole,
        })
        row.coachPersonId = next
        row.updatedAt = now
        snapshot.sessions.push({ id: row.id, previous, next })
        changes.push({ kind: 'substitution_entry', recordId: entry.id, action: 'created' })
      }
      for (const row of activities) {
        const next = handOverTarget(choices.handOver, row.groupId)
        if (next === undefined) continue
        snapshot.activities.push({ id: row.id, previous: row.defaultCoachPersonId as string, next })
        row.defaultCoachPersonId = next
        row.updatedAt = now
        changes.push({ kind: 'activity', recordId: row.id, action: 'updated' })
      }
      await em.flush()
      return { snapshot, changes }
    },

    async undo(em, subject, snapshot) {
      const before = snapshot as ActivitiesSnapshot | null | undefined
      if (!before) return []
      const scope = scopeOf(subject)
      const changes: DepartureChange[] = []
      const now = new Date()
      if (before.sessions.length > 0 && before.decidedByPersonId) {
        const rows = await em.find(
          Occurrence,
          { ...scope, id: { $in: before.sessions.map((entry) => entry.id) }, deletedAt: null },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        )
        const steps = await substitutionStepsOf(
          em,
          scope,
          rows.map((row) => row.id),
        )
        for (const row of rows) {
          const entry = before.sessions.find((candidate) => candidate.id === row.id) as SessionUndo
          // A session whose coach changed since the departure is left alone.
          if (!restorable(row.coachPersonId, entry.next)) continue
          const created = appendEntry(em, row, {
            kind: handOverEntryKind(steps.get(row.id) ?? [], entry.next, entry.previous),
            previousCoachPersonId: entry.next,
            newCoachPersonId: entry.previous,
            decidedByPersonId: before.decidedByPersonId,
            actingRole: before.actingRole,
          })
          row.coachPersonId = entry.previous
          row.updatedAt = now
          changes.push({ kind: 'substitution_entry', recordId: created.id, action: 'created' })
        }
      }
      if (before.activities.length > 0) {
        const rows = await em.find(Activity, {
          ...scope,
          id: { $in: before.activities.map((entry) => entry.id) },
          deletedAt: null,
        })
        for (const row of rows) {
          const entry = before.activities.find((candidate) => candidate.id === row.id) as ActivityUndo
          if (!restorable(row.defaultCoachPersonId, entry.next)) continue
          row.defaultCoachPersonId = entry.previous
          row.updatedAt = now
          changes.push({ kind: 'activity', recordId: row.id, action: 'updated' })
        }
      }
      await em.flush()
      return changes
    },

    async afterCommit(changes, ctx) {
      const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
      const entryIds = changes.filter((change) => change.kind === 'substitution_entry').map((c) => c.recordId)
      if (entryIds.length > 0) {
        const em = ctx.container.resolve<EntityManager>('em').fork()
        const entries = await em.find(SubstitutionEntry, { ...scope, id: { $in: entryIds } })
        const sessions = await em.find(Occurrence, {
          ...scope,
          id: { $in: [...new Set(entries.map((entry) => entry.occurrenceId))] },
        })
        const byId = new Map(sessions.map((row) => [row.id, row]))
        for (const entry of entries) {
          const row = byId.get(entry.occurrenceId)
          if (!row) continue
          await emitAfterCommit(
            entry.newCoachPersonId ? 'activities.occurrence.coach_changed' : 'activities.occurrence.coach_unassigned',
            scope,
            {
              id: row.id,
              activityId: row.activityId,
              groupId: row.groupId,
              sectionId: row.sectionId,
              substitutionEntryId: entry.id,
              kind: entry.kind,
              previousCoachPersonId: entry.previousCoachPersonId ?? null,
              newCoachPersonId: entry.newCoachPersonId ?? null,
              actorUserId: null,
              updatedAt: row.updatedAt.toISOString(),
            },
          )
        }
      }
      for (const change of changes) {
        if (change.kind !== 'activity') continue
        await emitAfterCommit('activities.activity.updated', scope, { id: change.recordId })
      }
    },

    async hasHistory(em, subject) {
      const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
      if ((await em.count(Occurrence, { ...scope, coachPersonId: subject.personId })) > 0) return true
      if ((await em.count(Activity, { ...scope, defaultCoachPersonId: subject.personId })) > 0) return true
      const entries = await em.count(SubstitutionEntry, {
        ...scope,
        $or: [{ previousCoachPersonId: subject.personId }, { newCoachPersonId: subject.personId }],
      })
      if (entries > 0) return true
      return (await em.count(Attendance, { ...scope, personId: subject.personId })) > 0
    },
  }
}
