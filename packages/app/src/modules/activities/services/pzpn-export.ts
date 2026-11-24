// The PZPN exports behind `GET /api/activities/reports/pzpn-schedule` and `pzpn-attendance` (training outlines spec
// REQ-O10, DD-O06, DD-O09; E24-S04, #684): one team's sessions of a period, and its players at each of them, turned
// into PZPN's columns by `lib/pzpn-export.ts`. Who may download:
// - `activities.reports.view` — the club administrator any team, a coordinator the teams of their sections, a coach
//   with that feature the groups they coach;
// - `activities.reports.view_own` — a coach the groups they coach.
// A team outside that reach answers the same 404 as an unknown team, so a coach of another group (or another club's
// group id) learns nothing (TEST-O08, #628). Without either feature → 403 `scope_denied`.
//
// The outline topic comes from the optional DI resolver `trainingOutlineTopics` (DD-O06), which the `training` module
// registers once outlines exist (E24-S03); without it the name column holds the activity name.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import {
  addCalendarDays,
  calendarDateInZone,
  grantContaining,
  zonedInstant,
  type CalendarDate,
  type GrantKind,
} from '@vereino/core'
import { foundationErrors, scopeContract } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Attendance, Occurrence } from '../data/entities'
import { wallTimeInZone } from '../lib/activities-rules'
import {
  isPzpnPeriod,
  pzpnAttendanceRow,
  pzpnScheduleRow,
  sortPzpnAttendance,
  type PzpnAttendanceEntry,
} from '../lib/pzpn-export'
import { REPORTS_VIEW_FEATURE, REPORTS_VIEW_OWN_FEATURE } from './coach-units'
import { clubTimeZone, findGroups, findPersons, findPlaces, rosterOn, type ActivitiesScope } from './directory'
import { activityLabels } from './read'

/** The DI token of the optional outline topic resolver (`training`, DD-O06). */
export const TRAINING_OUTLINE_TOPICS = 'trainingOutlineTopics'

/** The contract `training` registers: the outline topic of each session among `occurrenceIds` that has one. */
export type TrainingOutlineTopics = {
  topicsFor(scope: ActivitiesScope, occurrenceIds: readonly string[]): Promise<ReadonlyMap<string, string>>
}

export type PzpnExportQuery = { groupId: string; from: string; to: string }

/** The rows of an export, in column order, without the header line. */
export type PzpnExportRows = { rows: string[][] }

const STAFF_KINDS: readonly GrantKind[] = ['coach', 'coordinator', 'club_admin']
const OWN_KINDS: readonly GrantKind[] = ['coach']

type ExportBase = {
  em: EntityManager
  team: string
  timeZone: string
  sessions: Occurrence[]
}

/** The team when the caller may export it; otherwise a 403 (no feature) or the 404 of an unknown team. */
async function authorizedBase(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  query: PzpnExportQuery,
): Promise<ExportBase> {
  const userId = ctx.auth?.sub
  if (!userId) return foundationErrors.throw('scope_denied')
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  const canView = await rbac.userHasAllFeatures(userId, [REPORTS_VIEW_FEATURE], scope)
  const canViewOwn = canView || (await rbac.userHasAllFeatures(userId, [REPORTS_VIEW_OWN_FEATURE], scope))
  if (!canViewOwn) return foundationErrors.throw('scope_denied')
  if (!isPzpnPeriod(query.from, query.to)) return activitiesErrors.throw('report_period_invalid')
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const group = (await findGroups(ctx.container, scope, [query.groupId], em)).get(query.groupId)
  if (!group) return activitiesErrors.throw('report_group_not_found')
  const grants = await scopeContract.resolve(ctx)
  const target = { id: group.id, ...scope, groupId: group.id, sectionId: group.sectionId }
  if (!grantContaining(grants, canView ? STAFF_KINDS : OWN_KINDS, target)) {
    return activitiesErrors.throw('report_group_not_found')
  }
  // A moved session keeps its slot date (`occurrence_date`), so the period is read on the real start, in the club zone.
  const timeZone = await clubTimeZone(ctx.container, scope)
  const sessions = await em.find(
    Occurrence,
    {
      ...scope,
      groupId: group.id,
      deletedAt: null,
      startAt: {
        $gte: zonedInstant(query.from, '00:00', timeZone),
        $lt: zonedInstant(addCalendarDays(query.to, 1), '00:00', timeZone),
      },
    },
    { orderBy: { startAt: 'asc', id: 'asc' } },
  )
  return { em, team: group.name, timeZone, sessions }
}

function fullName(person: { firstName: string; lastName: string } | undefined): string | null {
  return person ? `${person.firstName} ${person.lastName}`.trim() : null
}

async function outlineTopics(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrenceIds: string[],
): Promise<ReadonlyMap<string, string>> {
  if (occurrenceIds.length === 0 || !container.hasRegistration(TRAINING_OUTLINE_TOPICS)) return new Map()
  return container.resolve<TrainingOutlineTopics>(TRAINING_OUTLINE_TOPICS).topicsFor(scope, occurrenceIds)
}

/** The schedule: one row per session of the team in the period, cancelled ones included. */
export async function readPzpnSchedule(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  query: PzpnExportQuery,
): Promise<PzpnExportRows> {
  const { em, team, timeZone, sessions } = await authorizedBase(ctx, scope, query)
  const placeIds = [...new Set(sessions.flatMap((row) => (row.placeId ? [row.placeId] : [])))]
  const coachIds = [...new Set(sessions.flatMap((row) => (row.coachPersonId ? [row.coachPersonId] : [])))]
  const [activities, places, coaches, topics] = await Promise.all([
    activityLabels(
      ctx.container,
      scope,
      sessions.map((row) => row.activityId),
    ),
    findPlaces(ctx.container, scope, placeIds, em),
    findPersons(ctx.container, scope, coachIds, em),
    outlineTopics(
      ctx.container,
      scope,
      sessions.map((row) => row.id),
    ),
  ])
  const rows = sessions.map((session) => {
    const activity = activities.get(session.activityId)
    return pzpnScheduleRow({
      team,
      type: activity?.type ?? 'other',
      date: calendarDateInZone(session.startAt, timeZone),
      start: wallTimeInZone(session.startAt, timeZone).slice(0, 5),
      end: wallTimeInZone(session.endAt, timeZone).slice(0, 5),
      place: (session.placeId ? places.get(session.placeId)?.name : null) ?? session.venueName ?? null,
      topic: topics.get(session.id) ?? null,
      activityName: activity?.name ?? '',
      coach: session.coachPersonId ? fullName(coaches.get(session.coachPersonId)) : null,
      status: session.status,
    })
  })
  return { rows }
}

/**
 * The attendance list: one row per session × player — the group's participants on the session's date and anyone with
 * an attendance row — for every session that was not cancelled.
 */
export async function readPzpnAttendance(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  query: PzpnExportQuery,
): Promise<PzpnExportRows> {
  const { em, team, timeZone, sessions: all } = await authorizedBase(ctx, scope, query)
  const sessions = all.filter((row) => row.status !== 'cancelled')
  if (sessions.length === 0) return { rows: [] }
  const attendances = await em.find(Attendance, {
    ...scope,
    occurrenceId: { $in: sessions.map((row) => row.id) },
    deletedAt: null,
  })
  const rowsBySession = new Map<string, Map<string, Attendance>>()
  for (const row of attendances) {
    const bySession = rowsBySession.get(row.occurrenceId) ?? new Map<string, Attendance>()
    bySession.set(row.personId, row)
    rowsBySession.set(row.occurrenceId, bySession)
  }
  const dayOf = new Map(sessions.map((row) => [row.id, calendarDateInZone(row.startAt, timeZone)]))
  const dates = [...new Set(dayOf.values())]
  const rosters = new Map(
    await Promise.all(
      dates.map(async (date) => {
        const roster = await rosterOn(ctx.container, scope, query.groupId, date, em)
        return [date, roster.filter((member) => member.role === 'participant').map((m) => m.personId)] as const
      }),
    ),
  )
  const listed = sessions.map((session) => ({
    session,
    personIds: [
      ...new Set([
        ...(rosters.get(dayOf.get(session.id) as CalendarDate) ?? []),
        ...(rowsBySession.get(session.id)?.keys() ?? []),
      ]),
    ],
  }))
  const persons = await findPersons(ctx.container, scope, [...new Set(listed.flatMap((entry) => entry.personIds))], em)
  const entries: PzpnAttendanceEntry[] = []
  for (const { session, personIds } of listed) {
    const start = wallTimeInZone(session.startAt, timeZone).slice(0, 5)
    for (const personId of personIds) {
      const person = persons.get(personId)
      // A person deleted since (the directory returns live persons only) leaves no row in the file.
      if (!person) continue
      const row = rowsBySession.get(session.id)?.get(personId)
      entries.push({
        team,
        date: dayOf.get(session.id) as CalendarDate,
        start,
        startAt: session.startAt,
        lastName: person.lastName,
        firstName: person.firstName,
        birthDate: person.birthDate,
        facts: row
          ? {
              actual: row.actual ?? null,
              declared: row.declared,
              declarationStatus: row.declarationStatus,
              declaredAt: row.declaredAt ?? null,
            }
          : undefined,
      })
    }
  }
  return { rows: sortPzpnAttendance(entries).map(pzpnAttendanceRow) }
}
