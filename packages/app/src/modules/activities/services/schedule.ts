// The session planner of `activities` (club spec DD-10, glossary *Session conflict*; foundation II DD-G02, DD-G03,
// DD-G05): the sessions a series generates in the horizon, the series-edit plan over the stored sessions, and the
// conflict check — the planned sessions on the candidate place's tree and of the coach, plus the optional occupancy
// provider — with the conflicting sessions described for the 409 and the preview.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import {
  expandOccurrences,
  seriesEditPlan,
  sessionInstants,
  type CalendarDate,
  type ExpandedOccurrence,
  type Recurrence,
  type SeriesEditPlan,
} from '@vereino/core'
import { occupancyProvider, type BlockingInterval } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, Attendance, Occurrence } from '../data/entities'
import {
  generationWindow,
  isPinnedSession,
  lastSessionDay,
  sessionConflicts,
  type CandidateSession,
  type ConflictKind,
  type SessionConflict,
} from '../lib/activities-rules'
import { placeFamily, type ActivitiesScope } from './directory'

const logger = createLogger('activities').child({ component: 'schedule' })

/** What a series is planned from. */
export type SeriesDefinition = {
  rule: Recurrence | null
  startsOn: CalendarDate
  endsOn: CalendarDate | null
  startTime: string
  endTime: string
  isActive: boolean
}

/**
 * The sessions a series has from `today` to the horizon end and the day it is generated until: a rule is expanded at
 * the club's wall time (DD-G02); a one-off activity has its single session; an inactive activity has none.
 */
export function plannedSessions(
  series: SeriesDefinition,
  today: CalendarDate,
  timeZone: string,
): { sessions: ExpandedOccurrence[]; generatedUntil: CalendarDate | null } {
  if (series.rule === null) {
    const sessions = series.isActive
      ? [sessionInstants(series.startsOn, series.startTime, series.endTime, timeZone)]
      : []
    return { sessions, generatedUntil: null }
  }
  // The window ends at the earlier of `ends_on` and the rule's `UNTIL` (club spec DD-10), so `generated_until` does too.
  const window = generationWindow(today, series.startsOn, lastSessionDay(series.rule, series.startsOn, series.endsOn))
  if (!window || !series.isActive) return { sessions: [], generatedUntil: window?.to ?? null }
  const sessions = expandOccurrences(
    series.rule,
    { startsOn: series.startsOn, startTime: series.startTime, endTime: series.endTime, timeZone },
    window,
  )
  return { sessions, generatedUntil: window.to }
}

/** The live sessions of an activity from `today` on, as the series-edit plan reads them. */
export async function futureSessions(
  em: EntityManager,
  scope: ActivitiesScope,
  activityId: string,
  today: CalendarDate,
): Promise<Occurrence[]> {
  return em.find(
    Occurrence,
    { ...scope, activityId, deletedAt: null, occurrenceDate: { $gte: today } },
    { orderBy: { occurrenceDate: 'asc' } },
  )
}

/**
 * The sessions among `rows` with checked-off actual attendance (#33): the club has acted on them, so a series edit
 * leaves them where they are (club spec *Data Models*: re-planning touches sessions "without attendance").
 */
export async function checkedOffSessionIds(
  em: EntityManager,
  scope: ActivitiesScope,
  rows: readonly Occurrence[],
): Promise<Set<string>> {
  if (rows.length === 0) return new Set()
  const marked = await em.find(
    Attendance,
    { ...scope, deletedAt: null, occurrenceId: { $in: rows.map((row) => row.id) }, actual: { $ne: null } },
    { fields: ['id', 'occurrenceId'] },
  )
  return new Set(marked.map((row) => row.occurrenceId))
}

/** A stored session wrapped for the series-edit plan. */
export type StoredSession = { id: string; date: CalendarDate; isDetached: boolean; pinned: boolean; row: Occurrence }

/**
 * The series-edit plan over stored sessions (DD-G03): a session is pinned when the club has acted on it — cancelled,
 * done, or with checked-off attendance (`checkedOff`, #33); substitutions join with their story.
 */
export function sessionPlan(
  existing: readonly Occurrence[],
  generated: readonly ExpandedOccurrence[],
  today: CalendarDate,
  checkedOff: ReadonlySet<string> = new Set(),
): SeriesEditPlan<StoredSession> {
  const sessions = existing.map((row) => ({
    id: row.id,
    date: row.occurrenceDate,
    isDetached: row.isDetached,
    pinned: isPinnedSession(row.status, checkedOff.has(row.id)),
    row,
  }))
  return seriesEditPlan(sessions, generated, today)
}

// --- Conflicts ---

export type ConflictingSession = {
  id: string
  activityId: string
  activityName: string | null
  groupId: string
  placeId: string
  startAt: string
  endAt: string
}

export type ConflictingBlock = { id: string; reason: string; startAt: string; endAt: string }

/** One candidate's conflict as the 409 body and the preview list it. */
export type ConflictEntry = {
  key: string
  startAt: string
  endAt: string
  kind: ConflictKind
  sessions: ConflictingSession[]
  blocks: ConflictingBlock[]
}

export type ConflictReport = {
  conflicts: ConflictEntry[]
  /** The occupancy provider failed: the preview warns, a save never reaches this (it fails closed). */
  providerFailed: boolean
}

export type ConflictCheck = {
  candidates: readonly CandidateSession[]
  placeId: string
  coachPersonId: string | null
  /** Stored sessions that do not block: the ones the write replaces, moves or removes. */
  ignoreIds?: readonly string[]
}

/**
 * The conflicts of the candidates against the organization's planned sessions and the optional occupancy provider.
 * `mode: 'save'` fails closed when the provider throws (an uncoded 500 with the fingerprint
 * `activities.occupancy.provider_failed`, foundation II DD-G14); `mode: 'preview'` reports `providerFailed` instead.
 */
export async function findConflicts(
  container: AwilixContainer,
  em: EntityManager,
  scope: ActivitiesScope,
  check: ConflictCheck,
  mode: 'save' | 'preview',
): Promise<ConflictReport> {
  if (check.candidates.length === 0) return { conflicts: [], providerFailed: false }
  const family = await placeFamily(container, scope, check.placeId, em)
  const relatedPlaceIds = family ? [...family.ancestorIds, ...family.descendantIds] : []
  const placeIds = [check.placeId, ...relatedPlaceIds]
  const start = new Date(Math.min(...check.candidates.map((candidate) => candidate.startAt.getTime())))
  const end = new Date(Math.max(...check.candidates.map((candidate) => candidate.endAt.getTime())))
  const ignore = [...new Set(check.ignoreIds ?? [])]
  const stored = await em.find(
    Occurrence,
    {
      ...scope,
      deletedAt: null,
      status: 'planned',
      startAt: { $lt: end },
      endAt: { $gt: start },
      $or: [{ placeId: { $in: placeIds } }, ...(check.coachPersonId ? [{ coachPersonId: check.coachPersonId }] : [])],
      ...(ignore.length > 0 ? { id: { $nin: ignore } } : {}),
    },
    { fields: ['id', 'activityId', 'groupId', 'placeId', 'coachPersonId', 'startAt', 'endAt'] },
  )
  let external: BlockingInterval[] = []
  let providerFailed = false
  const provider = occupancyProvider(container)
  if (provider) {
    try {
      external = await provider.blockingIntervals(placeIds, { start, end }, scope)
    } catch (error: unknown) {
      getTelemetryRuntime()?.reportError(error, { module: 'activities', code: 'activities.occupancy.provider_failed' })
      if (mode === 'save') {
        logger.error('Occupancy provider failed; the session write is refused', { ...scope, err: error })
        throw new Error('activities.occupancy.provider_failed')
      }
      providerFailed = true
    }
  }
  const conflicts = sessionConflicts({
    candidates: check.candidates,
    placeId: check.placeId,
    capacity: family?.place.capacityGroups ?? 1,
    relatedPlaceIds,
    coachPersonId: check.coachPersonId,
    existing: stored.map((row) => ({
      id: row.id,
      placeId: row.placeId,
      coachPersonId: row.coachPersonId ?? null,
      startAt: row.startAt,
      endAt: row.endAt,
    })),
    external: external.map((block) => ({
      id: block.id,
      placeId: block.resourceId,
      start: block.start,
      end: block.end,
    })),
  })
  return {
    conflicts: await describeConflicts(em, scope, conflicts, check.candidates, stored, external),
    providerFailed,
  }
}

type StoredBlocker = Pick<Occurrence, 'id' | 'activityId' | 'groupId' | 'placeId' | 'startAt' | 'endAt'>

async function describeConflicts(
  em: EntityManager,
  scope: ActivitiesScope,
  conflicts: readonly SessionConflict[],
  candidates: readonly CandidateSession[],
  stored: readonly StoredBlocker[],
  external: readonly BlockingInterval[],
): Promise<ConflictEntry[]> {
  if (conflicts.length === 0) return []
  const sessionsById = new Map(stored.map((row) => [row.id, row]))
  const blocksById = new Map(external.map((block) => [block.id, block]))
  const candidatesByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]))
  const activityIds = [...new Set(stored.map((row) => row.activityId))]
  const activities =
    activityIds.length > 0
      ? await em.find(Activity, { ...scope, id: { $in: activityIds } }, { fields: ['id', 'name'] })
      : []
  const names = new Map(activities.map((row) => [row.id, row.name]))
  return conflicts.map((conflict) => {
    const candidate = candidatesByKey.get(conflict.key) as CandidateSession
    const sessions: ConflictingSession[] = []
    const blocks: ConflictingBlock[] = []
    for (const id of conflict.conflictingIds) {
      const row = sessionsById.get(id)
      const block = blocksById.get(id)
      if (row) {
        sessions.push({
          id: row.id,
          activityId: row.activityId,
          activityName: names.get(row.activityId) ?? null,
          groupId: row.groupId,
          placeId: row.placeId,
          startAt: row.startAt.toISOString(),
          endAt: row.endAt.toISOString(),
        })
      } else if (block) {
        blocks.push({
          id: block.id,
          reason: block.reason,
          startAt: block.start.toISOString(),
          endAt: block.end.toISOString(),
        })
      }
    }
    return {
      key: conflict.key,
      startAt: candidate.startAt.toISOString(),
      endAt: candidate.endAt.toISOString(),
      kind: conflict.kind,
      sessions,
      blocks,
    }
  })
}

/**
 * Throws the 409 of a refused write (club spec: `occurrence_place_conflict` listing the conflicting sessions;
 * `occurrence_coach_conflict` when only the coach is double-booked). The body lists every conflict.
 */
export async function assertNoConflicts(report: ConflictReport): Promise<void> {
  if (report.conflicts.length === 0) return
  const code = report.conflicts.some((conflict) => conflict.kind === 'place')
    ? 'occurrence_place_conflict'
    : 'occurrence_coach_conflict'
  await activitiesErrors.throw(code, { conflicts: report.conflicts })
}
