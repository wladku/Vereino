// `activities.scheduleDirectory` (foundation III, #35): activities and sessions by id and the ones an author may
// address, for `communication` — the scope target of an announcement to an activity or a session (its section and
// group), the targets its composer offers, and the session a cancellation thread is about. `communication` reads it
// with `hasRegistration`, so it never imports `activities`; callers authorize the records that carry these ids.
import type { EntityManager } from '@mikro-orm/postgresql'
import { Activity, Occurrence } from '../data/entities'
import type { ActivityType, OccurrenceStatus } from '../lib/activities-rules'
import type { ActivitiesScope } from './directory'

export const ACTIVITIES_SCHEDULE_DIRECTORY = 'activities.scheduleDirectory' as const

export type ScheduleActivityEntry = {
  id: string
  name: string
  type: ActivityType
  groupId: string
  sectionId: string
  isActive: boolean
}

export type ScheduleOccurrenceEntry = {
  id: string
  activityId: string
  activityName: string | null
  groupId: string
  sectionId: string
  occurrenceDate: string
  startAt: Date
  endAt: Date
  status: OccurrenceStatus
  cancelReason: string | null
  updatedAt: Date
}

/** Which records an author's grants cover: everything (null), or the given sections, groups and sessions. */
export type ScheduleTargetFilter = {
  sectionIds?: readonly string[]
  groupIds?: readonly string[]
  occurrenceIds?: readonly string[]
} | null

export type ActivitiesScheduleDirectory = {
  findActivities(
    scope: ActivitiesScope,
    ids: readonly string[],
    em?: EntityManager,
  ): Promise<Map<string, ScheduleActivityEntry>>
  findOccurrences(
    scope: ActivitiesScope,
    ids: readonly string[],
    em?: EntityManager,
  ): Promise<Map<string, ScheduleOccurrenceEntry>>
  /** The live active activities the filter covers, by name (at most 500). */
  listActivities(
    scope: ActivitiesScope,
    filter: ScheduleTargetFilter,
    em?: EntityManager,
  ): Promise<ScheduleActivityEntry[]>
  /** The live sessions the filter covers that start inside the window, by start (at most 500). */
  listOccurrences(
    scope: ActivitiesScope,
    filter: ScheduleTargetFilter,
    window: { from: Date; to: Date },
    em?: EntityManager,
  ): Promise<ScheduleOccurrenceEntry[]>
}

function filterWhere(filter: ScheduleTargetFilter, idColumn: 'id' | null): Record<string, unknown> | null {
  if (!filter) return {}
  const or: Array<Record<string, unknown>> = []
  if (filter.sectionIds && filter.sectionIds.length > 0) or.push({ sectionId: { $in: [...filter.sectionIds] } })
  if (filter.groupIds && filter.groupIds.length > 0) or.push({ groupId: { $in: [...filter.groupIds] } })
  if (idColumn && filter.occurrenceIds && filter.occurrenceIds.length > 0) {
    or.push({ [idColumn]: { $in: [...filter.occurrenceIds] } })
  }
  return or.length > 0 ? { $or: or } : null
}

function activityEntry(row: Activity): ScheduleActivityEntry {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    groupId: row.groupId,
    sectionId: row.sectionId,
    isActive: row.isActive,
  }
}

async function occurrenceEntries(
  em: EntityManager,
  scope: ActivitiesScope,
  rows: Occurrence[],
): Promise<ScheduleOccurrenceEntry[]> {
  const activityIds = [...new Set(rows.map((row) => row.activityId))]
  const activities =
    activityIds.length > 0
      ? await em.find(Activity, { ...scope, id: { $in: activityIds } }, { fields: ['id', 'name'] })
      : []
  const names = new Map(activities.map((activity) => [activity.id, activity.name]))
  return rows.map((row) => ({
    id: row.id,
    activityId: row.activityId,
    activityName: names.get(row.activityId) ?? null,
    groupId: row.groupId,
    sectionId: row.sectionId,
    occurrenceDate: row.occurrenceDate,
    startAt: row.startAt,
    endAt: row.endAt,
    status: row.status,
    cancelReason: row.cancelReason ?? null,
    updatedAt: row.updatedAt,
  }))
}

export function createScheduleDirectory(getEm: () => EntityManager): ActivitiesScheduleDirectory {
  const emOf = (em?: EntityManager) => em ?? getEm().fork()
  return {
    async findActivities(scope, ids, em) {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return new Map()
      const rows = await emOf(em).find(Activity, { ...scope, id: { $in: unique }, deletedAt: null })
      return new Map(rows.map((row) => [row.id, activityEntry(row)]))
    },
    async findOccurrences(scope, ids, em) {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return new Map()
      const db = emOf(em)
      const rows = await db.find(Occurrence, { ...scope, id: { $in: unique }, deletedAt: null })
      return new Map((await occurrenceEntries(db, scope, rows)).map((entry) => [entry.id, entry]))
    },
    async listActivities(scope, filter, em) {
      const where = filterWhere(filter, null)
      if (!where) return []
      const rows = await emOf(em).find(
        Activity,
        { ...scope, deletedAt: null, isActive: true, ...where },
        { orderBy: { name: 'asc' }, limit: 500 },
      )
      return rows.map(activityEntry)
    },
    async listOccurrences(scope, filter, window, em) {
      const where = filterWhere(filter, 'id')
      if (!where) return []
      const db = emOf(em)
      const rows = await db.find(
        Occurrence,
        { ...scope, deletedAt: null, startAt: { $gte: window.from, $lt: window.to }, ...where },
        { orderBy: { startAt: 'asc' }, limit: 500 },
      )
      return occurrenceEntries(db, scope, rows)
    },
  }
}
