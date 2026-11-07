// Reads of the substitution history (club spec glossary *Substitution*, DD-12, REQ-008; E06-S13 #95): the entries of
// sessions oldest first, whom each session's coach stands in for (the "(substitution)" badge and "{substitute} for
// {coach}"), one session's history with its reasons decrypted, and the overlapping sessions that keep candidate coaches
// busy for the substitute dialog and the 409 of a forged assignment. Reads only; the commands write the entries.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Activity, Occurrence, SubstitutionEntry } from '../data/entities'
import { coachOptions } from '../lib/coach-options'
import {
  substituteFor,
  substituteOptions,
  type BusySession,
  type SubstituteOption,
  type SubstitutionKind,
} from '../lib/substitutions'
import { coachCandidateIds, findPersons, type ActivitiesScope } from './directory'

/** An entry as the steps read it: who had the session before and after, never the reason. */
export type SubstitutionStepRow = {
  id: string
  occurrenceId: string
  previousCoachPersonId: string | null
  newCoachPersonId: string | null
  kind: SubstitutionKind
}

/** The entries of `occurrenceIds`, oldest first, by session; never the reason. */
export async function substitutionStepsOf(
  em: EntityManager,
  scope: ActivitiesScope,
  occurrenceIds: readonly string[],
): Promise<Map<string, SubstitutionStepRow[]>> {
  const ids = [...new Set(occurrenceIds)]
  const result = new Map<string, SubstitutionStepRow[]>()
  if (ids.length === 0) return result
  const rows = await em.find(
    SubstitutionEntry,
    { ...scope, occurrenceId: { $in: ids } },
    {
      fields: ['id', 'occurrenceId', 'previousCoachPersonId', 'newCoachPersonId', 'kind', 'createdAt'],
      orderBy: { createdAt: 'asc', id: 'asc' },
    },
  )
  for (const row of rows) {
    const list = result.get(row.occurrenceId) ?? []
    list.push({
      id: row.id,
      occurrenceId: row.occurrenceId,
      previousCoachPersonId: row.previousCoachPersonId ?? null,
      newCoachPersonId: row.newCoachPersonId ?? null,
      kind: row.kind,
    })
    result.set(row.occurrenceId, list)
  }
  return result
}

/** The session ids among `occurrenceIds` with at least one substitution entry (pinned against a series edit). */
export async function substitutedSessionIds(
  em: EntityManager,
  scope: ActivitiesScope,
  occurrenceIds: readonly string[],
): Promise<Set<string>> {
  return new Set((await substitutionStepsOf(em, scope, occurrenceIds)).keys())
}

export type SubstituteFor = { personId: string; name: string | null }

/** Whom each session's current coach stands in for, with the name; sessions without a substitution are left out. */
export async function substituteForOf(
  container: AwilixContainer,
  scope: ActivitiesScope,
  rows: ReadonlyArray<{ id: string; coachPersonId: string | null }>,
  em: EntityManager = container.resolve<EntityManager>('em').fork(),
): Promise<Map<string, SubstituteFor>> {
  const steps = await substitutionStepsOf(
    em,
    scope,
    rows.map((row) => row.id),
  )
  const owners = new Map<string, string>()
  for (const row of rows) {
    const own = substituteFor(steps.get(row.id) ?? [], row.coachPersonId)
    if (own) owners.set(row.id, own)
  }
  if (owners.size === 0) return new Map()
  const persons = await findPersons(container, scope, [...new Set(owners.values())])
  return new Map(
    [...owners].map(([occurrenceId, personId]) => {
      const person = persons.get(personId)
      return [occurrenceId, { personId, name: person ? `${person.firstName} ${person.lastName}` : null }]
    }),
  )
}

export type SubstitutionHistoryItem = {
  id: string
  kind: SubstitutionKind
  previousCoachPersonId: string | null
  previousCoachName: string | null
  newCoachPersonId: string | null
  newCoachName: string | null
  reason: string | null
  decidedByPersonId: string
  decidedByName: string | null
  actingRole: string
  createdAt: string
}

/** One session's substitution history, oldest first, with names and the reasons decrypted. */
export async function substitutionHistory(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrenceId: string,
): Promise<SubstitutionHistoryItem[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await findWithDecryption(
    em,
    SubstitutionEntry,
    { ...scope, occurrenceId },
    { orderBy: { createdAt: 'asc', id: 'asc' } },
    scope,
  )
  if (rows.length === 0) return []
  const persons = await findPersons(
    container,
    scope,
    rows
      .flatMap((row) => [row.previousCoachPersonId, row.newCoachPersonId, row.decidedByPersonId])
      .filter((id): id is string => typeof id === 'string'),
  )
  const name = (id: string | null | undefined): string | null => {
    const person = id ? persons.get(id) : undefined
    return person ? `${person.firstName} ${person.lastName}` : null
  }
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    previousCoachPersonId: row.previousCoachPersonId ?? null,
    previousCoachName: name(row.previousCoachPersonId),
    newCoachPersonId: row.newCoachPersonId ?? null,
    newCoachName: name(row.newCoachPersonId),
    reason: row.reason ?? null,
    decidedByPersonId: row.decidedByPersonId,
    decidedByName: name(row.decidedByPersonId),
    actingRole: row.actingRole,
    createdAt: row.createdAt.toISOString(),
  }))
}

/** A session that keeps a coach busy, with what the 409 conflict list names. */
export type BusyCoachSession = BusySession & { activityId: string; groupId: string; placeId: string; endAt: Date }

/**
 * The planned sessions of `coachPersonIds` that overlap `occurrence` (other than itself), with their activity names —
 * the sessions that keep a candidate coach busy at that time.
 */
export async function busySessionsOf(
  em: EntityManager,
  scope: ActivitiesScope,
  occurrence: Pick<Occurrence, 'id' | 'startAt' | 'endAt'>,
  coachPersonIds: readonly string[],
): Promise<BusyCoachSession[]> {
  const ids = [...new Set(coachPersonIds)]
  if (ids.length === 0) return []
  const rows = await em.find(
    Occurrence,
    {
      ...scope,
      deletedAt: null,
      status: 'planned',
      id: { $ne: occurrence.id },
      coachPersonId: { $in: ids },
      startAt: { $lt: occurrence.endAt },
      endAt: { $gt: occurrence.startAt },
    },
    {
      fields: ['id', 'activityId', 'groupId', 'placeId', 'coachPersonId', 'startAt', 'endAt'],
      orderBy: { startAt: 'asc', id: 'asc' },
    },
  )
  if (rows.length === 0) return []
  const activities = await em.find(
    Activity,
    { ...scope, id: { $in: [...new Set(rows.map((row) => row.activityId))] } },
    { fields: ['id', 'name'] },
  )
  const names = new Map(activities.map((row) => [row.id, row.name]))
  return rows.map((row) => ({
    id: row.id,
    coachPersonId: row.coachPersonId as string,
    activityId: row.activityId,
    activityName: names.get(row.activityId) ?? null,
    groupId: row.groupId,
    placeId: row.placeId,
    startAt: row.startAt,
    endAt: row.endAt,
  }))
}

/** The substitute dialog lists every coach of the club; a club rarely has this many. */
const MAX_SUBSTITUTE_OPTIONS = 200

/**
 * The coaches a session can be given to (README B-15 "Assign substitute"): an active coach role or a coach / assistant
 * membership on the session date, by last name, without the current coach, each with the session that keeps them busy.
 */
export async function substituteOptionsFor(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrence: Pick<Occurrence, 'id' | 'occurrenceDate' | 'startAt' | 'endAt' | 'coachPersonId'>,
): Promise<SubstituteOption[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const persons = await findPersons(
    container,
    scope,
    await coachCandidateIds(container, scope, occurrence.occurrenceDate, em),
    em,
  )
  const candidates = coachOptions([...persons.values()], null, MAX_SUBSTITUTE_OPTIONS)
  const busy = await busySessionsOf(
    em,
    scope,
    occurrence,
    candidates.map((candidate) => candidate.id),
  )
  return substituteOptions(candidates, busy, occurrence.coachPersonId ?? null)
}
