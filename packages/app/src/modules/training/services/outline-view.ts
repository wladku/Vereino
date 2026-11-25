// The outline as the member pages read it (training outlines spec M-O5, M-O6, M-O7; #683): the content with the
// planned minutes, the session it belongs to (date, time, place, coach, activity), its group's name, its author, whether
// it is locked (BR-O3) and the PDF's file name; and the names a list shows next to the rows its scope filter admitted.
// Sessions come from `activities.occurrenceFacts`, names from the `groups` and `people` directories.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { Scope } from '@vereino/core'
import { assertInScope } from '@/modules/foundation'
import { OUTLINE_KINDS, outlineTarget } from '../commands/shared'
import { Outline } from '../data/entities'
import {
  isOutlineLocked,
  outlineFileName,
  outlineMinutes,
  readParts,
  type OutlineLanguage,
  type OutlinePart,
  type OutlineParts,
} from '../lib/outline'
import {
  clubName,
  findGroups,
  findOccurrences,
  findPersons,
  type OccurrenceFact,
  type TrainingScope,
} from './directory'

export type OutlineSessionView = {
  id: string
  activityId: string
  activityName: string | null
  type: string
  status: string
  occurrenceDate: string
  startAt: string
  endAt: string
  placeLabel: string | null
  coachName: string | null
}

export type OutlineView = {
  id: string
  authorPersonId: string
  authorName: string | null
  sectionId: string | null
  groupId: string | null
  groupName: string | null
  activityId: string | null
  occurrenceId: string | null
  sourceOutlineId: string | null
  language: OutlineLanguage
  topic: string
  goal: string
  specificGoals: string
  ageCategory: string
  durationMinutes: number
  playersCount: number | null
  equipment: string
  parts: OutlineParts
  minutes: Record<OutlinePart, number> & { total: number }
  session: OutlineSessionView | null
  locked: boolean
  fileName: string
  createdAt: string
  updatedAt: string
}

const fullName = (person: { firstName: string; lastName: string } | undefined): string | null =>
  person ? `${person.firstName} ${person.lastName}`.trim() : null

function sessionView(fact: OccurrenceFact, coachName: string | null): OutlineSessionView {
  return {
    id: fact.id,
    activityId: fact.activityId,
    activityName: fact.activityName,
    type: fact.type,
    status: fact.status,
    occurrenceDate: fact.occurrenceDate,
    startAt: fact.startAt,
    endAt: fact.endAt,
    placeLabel: fact.placeLabel,
    coachName,
  }
}

/** The views of `rows`, with the names, sessions and lock state, in the order of `rows`. */
export async function outlineViews(
  container: AwilixContainer,
  scope: TrainingScope,
  rows: readonly Outline[],
  now = new Date(),
  em?: EntityManager,
): Promise<OutlineView[]> {
  if (rows.length === 0) return []
  const sessions = await findOccurrences(
    container,
    scope,
    rows.flatMap((row) => (row.occurrenceId ? [row.occurrenceId] : [])),
    em,
  )
  const personIds = [
    ...rows.map((row) => row.authorPersonId),
    ...[...sessions.values()].flatMap((fact) => (fact.coachPersonId ? [fact.coachPersonId] : [])),
  ]
  const [groups, persons] = await Promise.all([
    findGroups(container, scope, [...new Set(rows.flatMap((row) => (row.groupId ? [row.groupId] : [])))], em),
    findPersons(container, scope, [...new Set(personIds)], em),
  ])
  return rows.map((row) => {
    const parts = readParts(row.parts)
    const fact = row.occurrenceId ? (sessions.get(row.occurrenceId) ?? null) : null
    return {
      id: row.id,
      authorPersonId: row.authorPersonId,
      authorName: fullName(persons.get(row.authorPersonId)),
      sectionId: row.sectionId ?? null,
      groupId: row.groupId ?? null,
      groupName: row.groupId ? (groups.get(row.groupId)?.name ?? null) : null,
      activityId: row.activityId ?? null,
      occurrenceId: row.occurrenceId ?? null,
      sourceOutlineId: row.sourceOutlineId ?? null,
      language: row.language,
      topic: row.topic,
      goal: row.goal,
      specificGoals: row.specificGoals,
      ageCategory: row.ageCategory,
      durationMinutes: row.durationMinutes,
      playersCount: row.playersCount ?? null,
      equipment: row.equipment,
      parts,
      minutes: outlineMinutes(parts),
      session: fact ? sessionView(fact, fact.coachPersonId ? fullName(persons.get(fact.coachPersonId)) : null) : null,
      locked: isOutlineLocked(fact?.endAt ?? null, now),
      fileName: outlineFileName({ language: row.language, topic: row.topic, date: fact?.occurrenceDate ?? null }),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  })
}

/**
 * One outline for the caller, with the club's name for the print header: null when it is unknown in the organization (or removed); 403 `scope_denied` (thrown)
 * when no grant covers it — its author, a coach of its group, a coordinator of its section, the administrator.
 */
export async function readOutline(
  container: AwilixContainer,
  scope: TrainingScope,
  grants: Scope,
  id: string,
): Promise<{ row: Outline; view: OutlineView & { clubName: string | null } } | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const row = await em.findOne(Outline, { ...scope, id, deletedAt: null })
  if (!row) return null
  await assertInScope(grants, OUTLINE_KINDS, outlineTarget(row))
  const [[view], club] = await Promise.all([
    outlineViews(container, scope, [row], new Date(), em),
    clubName(container, scope),
  ])
  return { row, view: { ...view, clubName: club } }
}
