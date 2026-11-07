// `GET /api/activities/reports/coach-units` (club spec REQ-008, REQ-021, AC-008, AC-021; README B-16, M "My units";
// #96): the month's closed sessions counted per coach (`lib/coach-units.ts`). Who sees what:
// - `activities.reports.view` — the club administrator every section (or `sectionId`), a coordinator their sections
//   (another section → 403 `scope_denied`);
// - `activities.reports.view_own` — only the caller's own row (`self` grant), in every section; `mine=1` asks for it
//   explicitly (the phone's "My units" for a coordinator who also coaches);
// - amounts, the contract state and the CSV amount column only with `club_core.contracts.manage` (the administrator).
// Rates come from `club_core` through its DI read (`clubCoreContracts`), never from its entities.
import type { FilterQuery } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { Scope } from '@vereino/core'
import { foundationErrors, scopeContract, scopeDenialCode } from '@/modules/foundation'
import type { ClubCoreContracts } from '../../club_core/services/contracts'
import { activitiesErrors } from '../api/errors'
import { Occurrence, SubstitutionEntry } from '../data/entities'
import {
  countCoachUnits,
  coachUnitsCsv,
  monthRange,
  ownCoachOf,
  priceCoachRow,
  type CoachSessionRole,
  type CoachSettlementModel,
  type ContractState,
  type ReportSession,
} from '../lib/coach-units'
import { unsettledCutoff } from '../lib/substitutions'
import { findPersons, type ActivitiesScope } from './directory'
import { activityLabels, nameMaps } from './read'

const CLUB_CORE_CONTRACTS = 'clubCoreContracts'

export const REPORTS_VIEW_FEATURE = 'activities.reports.view'
export const REPORTS_VIEW_OWN_FEATURE = 'activities.reports.view_own'
export const CONTRACTS_MANAGE_FEATURE = 'club_core.contracts.manage'

export type CoachUnitsQuery = { month: string; sectionId?: string; mine?: boolean }

export type CoachUnitsSession = {
  id: string
  date: string
  type: string
  isAway: boolean
  role: CoachSessionRole
  activityName: string | null
  groupName: string | null
}

export type CoachUnitsReportRow = {
  personId: string
  coachName: string | null
  planned: number
  handedOver: number
  takenOver: number
  balance: number
  matches: number
  trips: number
  sessions: CoachUnitsSession[]
  /** Grosz; present only with `club_core.contracts.manage`. */
  amount?: number | null
  contractState?: ContractState
}

export type CoachUnitsReport = {
  month: string
  from: string
  to: string
  /** `staff` — the rows of the caller's sections; `own` — the caller's own row only. */
  perspective: 'staff' | 'own'
  model: CoachSettlementModel
  currency: string
  withAmounts: boolean
  items: CoachUnitsReportRow[]
  /** Planned sessions of the month in the same reach that ended 24 hours ago or more (README B-15 "Unsettled"). */
  unsettledCount: number
}

function grantIds(grants: Scope, kind: string): string[] {
  return grants.filter((grant) => grant.kind === kind).flatMap((grant) => [...(grant.ids ?? [])])
}

function contractsService(container: AwilixContainer): ClubCoreContracts {
  if (!container.hasRegistration(CLUB_CORE_CONTRACTS)) {
    throw new Error('[internal] activities requires the DI service ' + CLUB_CORE_CONTRACTS)
  }
  return container.resolve<ClubCoreContracts>(CLUB_CORE_CONTRACTS)
}

/** Which sessions the caller may count: every section, some sections, or the caller's own person. */
type Reach = { kind: 'sections'; sectionIds: string[] | null } | { kind: 'own'; personId: string }

async function resolveReach(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  grants: Scope,
  query: CoachUnitsQuery,
): Promise<Reach> {
  const userId = ctx.auth?.sub
  if (!userId) return foundationErrors.throw('scope_denied')
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  const canView = await rbac.userHasAllFeatures(userId, [REPORTS_VIEW_FEATURE], scope)
  const canViewOwn = canView || (await rbac.userHasAllFeatures(userId, [REPORTS_VIEW_OWN_FEATURE], scope))
  const isAdmin = grants.some((grant) => grant.kind === 'club_admin')
  const sections = grantIds(grants, 'coordinator')
  if (canView && !query.mine && (isAdmin || sections.length > 0)) {
    if (query.sectionId && !isAdmin && !sections.includes(query.sectionId)) {
      return foundationErrors.throw('scope_denied')
    }
    if (query.sectionId) return { kind: 'sections', sectionIds: [query.sectionId] }
    return { kind: 'sections', sectionIds: isAdmin ? null : sections }
  }
  const self = grantIds(grants, 'self')[0]
  if (!canViewOwn || !self) return foundationErrors.throw(scopeDenialCode(grants))
  return { kind: 'own', personId: self }
}

type ReportOccurrence = Pick<
  Occurrence,
  'id' | 'activityId' | 'groupId' | 'sectionId' | 'occurrenceDate' | 'coachPersonId'
>

/** The month's `done` sessions in reach (own reach: led by the caller, or handed over by them). */
async function loadSessions(
  em: EntityManager,
  scope: ActivitiesScope,
  reach: Reach,
  range: { from: string; to: string },
  sectionId: string | undefined,
): Promise<ReportOccurrence[]> {
  const base: FilterQuery<Occurrence> = {
    ...scope,
    status: 'done',
    deletedAt: null,
    occurrenceDate: { $gte: range.from, $lte: range.to },
  }
  const fields = ['id', 'activityId', 'groupId', 'sectionId', 'occurrenceDate', 'coachPersonId'] as const
  if (reach.kind === 'sections') {
    const where: FilterQuery<Occurrence> = reach.sectionIds ? { ...base, sectionId: { $in: reach.sectionIds } } : base
    return em.find(Occurrence, where, { fields: [...fields] })
  }
  // Own reach: the sessions the coach led, and those whose history names them as the coach before a substitution.
  const handed = await em.find(
    SubstitutionEntry,
    { ...scope, previousCoachPersonId: reach.personId },
    { fields: ['occurrenceId'] },
  )
  const handedIds = [...new Set(handed.map((row) => row.occurrenceId))]
  const mine: FilterQuery<Occurrence>[] = [
    { coachPersonId: reach.personId },
    ...(handedIds.length > 0 ? [{ id: { $in: handedIds } }] : []),
  ]
  return em.find(Occurrence, { ...base, ...(sectionId ? { sectionId } : {}), $or: mine }, { fields: [...fields] })
}

/** The first substitution entry of each session (its own coach), by session id. */
async function firstEntries(
  em: EntityManager,
  scope: ActivitiesScope,
  occurrenceIds: string[],
): Promise<Map<string, { previousCoachPersonId: string | null }>> {
  const first = new Map<string, { previousCoachPersonId: string | null }>()
  if (occurrenceIds.length === 0) return first
  const rows = await em.find(
    SubstitutionEntry,
    { ...scope, occurrenceId: { $in: occurrenceIds } },
    { fields: ['occurrenceId', 'previousCoachPersonId', 'createdAt'], orderBy: { createdAt: 'asc', id: 'asc' } },
  )
  for (const row of rows) {
    if (!first.has(row.occurrenceId)) {
      first.set(row.occurrenceId, { previousCoachPersonId: row.previousCoachPersonId ?? null })
    }
  }
  return first
}

async function countUnsettled(
  em: EntityManager,
  scope: ActivitiesScope,
  reach: Reach,
  range: { from: string; to: string },
  sectionId: string | undefined,
  now: Date,
): Promise<number> {
  const where: FilterQuery<Occurrence> = {
    ...scope,
    status: 'planned',
    deletedAt: null,
    occurrenceDate: { $gte: range.from, $lte: range.to },
    endAt: { $lte: unsettledCutoff(now) },
    ...(reach.kind === 'own' ? { coachPersonId: reach.personId, ...(sectionId ? { sectionId } : {}) } : {}),
    ...(reach.kind === 'sections' && reach.sectionIds ? { sectionId: { $in: reach.sectionIds } } : {}),
  }
  return em.count(Occurrence, where)
}

export async function readCoachUnits(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  query: CoachUnitsQuery,
  now: Date = new Date(),
): Promise<CoachUnitsReport> {
  const range = monthRange(query.month)
  if (!range) return activitiesErrors.throw('report_month_invalid')
  const grants = await scopeContract.resolve(ctx)
  const reach = await resolveReach(ctx, scope, grants, query)
  const userId = ctx.auth?.sub as string
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  const withAmounts = await rbac.userHasAllFeatures(userId, [CONTRACTS_MANAGE_FEATURE], scope)
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const sessions = await loadSessions(em, scope, reach, range, query.sectionId)
  const ids = sessions.map((row) => row.id)
  const [entries, activities, names, unsettledCount] = await Promise.all([
    firstEntries(em.fork(), scope, ids),
    activityLabels(
      ctx.container,
      scope,
      sessions.map((row) => row.activityId),
    ),
    nameMaps(ctx.container, scope, {
      groupIds: sessions.map((row) => row.groupId),
      sectionIds: [],
      placeIds: [],
      personIds: [],
    }),
    countUnsettled(em.fork(), scope, reach, range, query.sectionId, now),
  ])
  const counted: ReportSession[] = sessions.map((row) => {
    const activity = activities.get(row.activityId)
    return {
      id: row.id,
      date: row.occurrenceDate,
      type: activity?.type ?? 'other',
      isAway: activity?.isAway === true,
      leaderPersonId: row.coachPersonId ?? null,
      ownPersonId: ownCoachOf(row.coachPersonId ?? null, entries.get(row.id)),
    }
  })
  let rows = countCoachUnits(counted)
  if (reach.kind === 'own') rows = rows.filter((row) => row.personId === reach.personId)
  const contracts = contractsService(ctx.container)
  const { model, currency } = await contracts.settlement(scope)
  const rates = withAmounts
    ? await contracts.coachContracts(
        scope,
        rows.map((row) => row.personId),
        range.from,
        range.to,
      )
    : null
  const persons = await findPersons(
    ctx.container,
    scope,
    rows.map((row) => row.personId),
  )
  const sessionById = new Map(sessions.map((row) => [row.id, row]))
  const items = rows.map((row): CoachUnitsReportRow => {
    const person = persons.get(row.personId)
    const item: CoachUnitsReportRow = {
      personId: row.personId,
      coachName: person ? `${person.firstName} ${person.lastName}` : null,
      planned: row.planned,
      handedOver: row.handedOver,
      takenOver: row.takenOver,
      balance: row.balance,
      matches: row.matches,
      trips: row.trips,
      sessions: row.sessions.map((entry) => {
        const session = sessionById.get(entry.id)
        return {
          ...entry,
          activityName: session ? (activities.get(session.activityId)?.name ?? null) : null,
          groupName: session ? (names.groups.get(session.groupId) ?? null) : null,
        }
      }),
    }
    if (rates) Object.assign(item, priceCoachRow(row, rates.get(row.personId) ?? [], model))
    return item
  })
  const sortKey = (row: CoachUnitsReportRow) => {
    const person = persons.get(row.personId)
    return person ? `${person.lastName}\u0000${person.firstName}` : `￿${row.personId}`
  }
  items.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  return {
    month: query.month,
    from: range.from,
    to: range.to,
    perspective: reach.kind === 'own' ? 'own' : 'staff',
    model,
    currency,
    withAmounts,
    items,
    unsettledCount,
  }
}

/** The report as CSV; the amount column only when the report carries amounts. */
export function coachUnitsReportCsv(report: CoachUnitsReport): string {
  return coachUnitsCsv(
    report.items.map((row) => ({ ...row, coach: row.coachName ?? row.personId, amount: row.amount ?? null })),
    report.withAmounts,
  )
}
