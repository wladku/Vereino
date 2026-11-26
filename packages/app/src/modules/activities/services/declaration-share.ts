// `GET /api/activities/reports/declaration-share` (product brief Goals — the primary metric; D21; E27-S01, #818): per
// section, the share of attendance declarations made in Vereino in a period of club-zone dates (`lib/declaration-share.ts`
// holds the rules). The one read behind the panel report and the coordinator's phone view (E27-S02).
//
// Who sees what: `activities.reports.view` with the record scope — the club administrator every live section, a
// coordinator their sections; anyone else (a coach, a guardian, a participant) 403. Counts only: no names, no
// per-person rows.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { calendarDateInZone, type Scope } from '@vereino/core'
import { foundationErrors, scopeContract, scopeDenialCode } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Attendance, Occurrence } from '../data/entities'
import {
  resolveSharePeriod,
  sectionShares,
  sharePercent,
  type ShareAttendance,
  type ShareCounts,
  type ShareSession,
} from '../lib/declaration-share'
import type { RosterEntry } from '../../groups/services/group-directory'
import { attendanceSettings, listSectionsAmong, rosterOn, type ActivitiesScope } from './directory'
import { activityLabels } from './read'
import { REPORTS_VIEW_FEATURE } from './coach-units'

export type DeclarationShareQuery = { from?: string; to?: string }

export type DeclarationShareCounts = ShareCounts & {
  /** A whole percent, or null when nothing was counted. */
  percent: number | null
}

export type DeclarationShareRow = {
  sectionId: string
  sectionName: string
  /** The `done` sessions of the period; 0 reads "No completed sessions". */
  sessions: number
  confirm: DeclarationShareCounts
  absence: DeclarationShareCounts
  headline: DeclarationShareCounts
}

export type DeclarationShareReport = {
  from: string
  to: string
  timeZone: string
  items: DeclarationShareRow[]
}

function withPercent(counts: ShareCounts): DeclarationShareCounts {
  return { ...counts, percent: sharePercent(counts) }
}

/** The sections the caller may read: every one (null) for the club administrator, else the coordinator's sections. */
async function reachableSections(ctx: CommandRuntimeContext, scope: ActivitiesScope, grants: Scope) {
  const userId = ctx.auth?.sub
  if (!userId) return foundationErrors.throw('scope_denied')
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  const canView = await rbac.userHasAllFeatures(userId, [REPORTS_VIEW_FEATURE], scope)
  const isAdmin = grants.some((grant) => grant.kind === 'club_admin')
  const sections = grants.filter((grant) => grant.kind === 'coordinator').flatMap((grant) => [...(grant.ids ?? [])])
  if (!canView || (!isAdmin && sections.length === 0)) return foundationErrors.throw(scopeDenialCode(grants))
  return isAdmin ? null : [...new Set(sections)]
}

export async function readDeclarationShare(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  query: DeclarationShareQuery,
  now: Date = new Date(),
): Promise<DeclarationShareReport> {
  const grants = await scopeContract.resolve(ctx)
  const sectionIds = await reachableSections(ctx, scope, grants)
  const settings = await attendanceSettings(ctx.container, scope)
  const period = resolveSharePeriod(query, calendarDateInZone(now, settings.timeZone))
  if (!period) return activitiesErrors.throw('report_period_invalid')
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const sections = await listSectionsAmong(ctx.container, scope, sectionIds, em)
  const reach = sections.map((section) => section.id)
  const occurrences =
    reach.length === 0
      ? []
      : await em.find(
          Occurrence,
          {
            ...scope,
            status: 'done',
            deletedAt: null,
            sectionId: { $in: reach },
            occurrenceDate: { $gte: period.from, $lte: period.to },
          },
          { fields: ['id', 'activityId', 'groupId', 'sectionId', 'occurrenceDate', 'startAt'] },
        )
  const ids = occurrences.map((row) => row.id)
  const [activities, attendances] = await Promise.all([
    activityLabels(
      ctx.container,
      scope,
      occurrences.map((row) => row.activityId),
    ),
    ids.length === 0
      ? Promise.resolve([] as Attendance[])
      : em.fork().find(
          Attendance,
          { ...scope, occurrenceId: { $in: ids }, deletedAt: null },
          {
            fields: ['occurrenceId', 'personId', 'declared', 'declaredAt', 'declarationStatus', 'actual', 'source'],
          },
        ),
  ])
  const rowsBySession = new Map<string, ShareAttendance[]>()
  for (const row of attendances) {
    const list = rowsBySession.get(row.occurrenceId) ?? []
    list.push({
      personId: row.personId,
      declared: row.declared,
      declaredAt: row.declaredAt ?? null,
      declarationStatus: row.declarationStatus,
      actual: row.actual ?? null,
      source: row.source,
    })
    rowsBySession.set(row.occurrenceId, list)
  }
  const kindOf = (activityId: string) =>
    settings.declarationKinds[activities.get(activityId)?.type ?? 'other'] ?? 'confirm'
  // The roster is read once per group and date, and only for `confirm` sessions (absences need no roster).
  const rosters = new Map<string, Promise<RosterEntry[]>>()
  const rosterOf = (groupId: string, date: string) => {
    const key = `${groupId}:${date}`
    let roster = rosters.get(key)
    if (!roster) {
      roster = rosterOn(ctx.container, scope, groupId, date)
      rosters.set(key, roster)
    }
    return roster
  }
  const sessions: ShareSession[] = await Promise.all(
    occurrences.map(async (row): Promise<ShareSession> => {
      const kind = kindOf(row.activityId)
      const roster = kind === 'confirm' ? await rosterOf(row.groupId, row.occurrenceDate) : []
      return {
        sectionId: row.sectionId,
        kind,
        startAt: row.startAt,
        participantIds: roster.filter((member) => member.role === 'participant').map((member) => member.personId),
        rows: rowsBySession.get(row.id) ?? [],
      }
    }),
  )
  const names = new Map(sections.map((section) => [section.id, section.name]))
  const items = sectionShares(reach, sessions).map((share): DeclarationShareRow => ({
    sectionId: share.sectionId,
    sectionName: names.get(share.sectionId) ?? '',
    sessions: share.sessions,
    confirm: withPercent(share.confirm),
    absence: withPercent(share.absence),
    headline: withPercent(share.headline),
  }))
  return { from: period.from, to: period.to, timeZone: settings.timeZone, items }
}
