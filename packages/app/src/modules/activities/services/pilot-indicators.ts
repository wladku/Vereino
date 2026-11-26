// The pilot's leading indicators per section (club spec *Overview and Success Measures*; product brief Goals, D21;
// E27-S03, #820), read next to the declaration share for the same sections and period (`declaration-share.ts` has
// already checked `activities.reports.view` and narrowed the sections to the caller's record scope). The rules live
// in `lib/pilot-indicators.ts`; this file reads the records:
//
// - Accounts: the participants of each section's live active groups on the counting day (`groups.directory`), their
//   guardians on that day and the guardians' users (`people.personDirectory`), and which users have an active account
//   created before the end of that day (`activeAccountUserIds`, the platform user, never stored here);
// - Attendance within 24 h: the session's status, end and version; for a `done` session changed after its deadline
//   the first closing of its list from the action log (the check-off entry whose context says `completed`, read
//   through the platform `actionLogService`, which decrypts it; only the entries up to the deadline) — no closing
//   time is stored on the session;
// - Paid on time: the optional `payments.paidOnTime` service; null when `payments` is disabled;
// - Covered before start: the session's substitution entries.
//
// Counts only, no names.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { addCalendarDays, calendarDateInZone, zonedInstant, type CalendarDate } from '@vereino/core'
import { activeAccountUserIds } from '@/modules/foundation'
import { Occurrence, SubstitutionEntry } from '../data/entities'
import {
  accountsDate,
  closeDeadline,
  countAccounts,
  countClosedWithinDay,
  countCoveredBeforeStart,
  firstClosing,
  indicatorPercent,
  needsCloseLookup,
  type ClosingSession,
  type CoverSession,
  type IndicatorCounts,
} from '../lib/pilot-indicators'
import type { SharePeriod } from '../lib/declaration-share'
import { activeGuardians, findUserIds, listGroupsInSections, rosterOn, type ActivitiesScope } from './directory'

/**
 * The read `payments` registers as `payments.paidOnTime` (`payments/services/paid-on-time.ts`): per section among
 * `sectionIds`, the `fee` and `order` charges due in the period and how many were fully paid by their due date.
 */
export type PaidOnTimeReader = {
  paidOnTime(
    scope: ActivitiesScope,
    sectionIds: readonly string[],
    period: SharePeriod,
    today: CalendarDate,
  ): Promise<Map<string, IndicatorCounts>>
}

const PAYMENTS_PAID_ON_TIME = 'payments.paidOnTime'
const ACTION_LOG_SERVICE = 'actionLogService'
/** The resource kind of a session's action-log entries (`commands/occurrences.ts`). */
const OCCURRENCE_RESOURCE_KIND = 'activities.occurrence'
/** How many reads run at the same time (each takes a pooled connection). */
const READS_AT_ONCE = 8
const LOG_PAGE = 200

export type IndicatorValue = IndicatorCounts & {
  /** A whole percent, or null when `total` is 0. */
  percent: number | null
}

export type PilotIndicators = {
  accounts: IndicatorValue
  attendanceWithinDay: IndicatorValue
  /** Null when the `payments` module is disabled: the report hides the indicator, never shows 0. */
  paidOnTime: IndicatorValue | null
  coverBeforeStart: IndicatorValue
}

export type PilotIndicatorsResult = { paymentsEnabled: boolean; bySection: Map<string, PilotIndicators> }

function value(counts: IndicatorCounts): IndicatorValue {
  return { ...counts, percent: indicatorPercent(counts) }
}

async function inBatches<T, R>(items: readonly T[], read: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let start = 0; start < items.length; start += READS_AT_ONCE) {
    results.push(...(await Promise.all(items.slice(start, start + READS_AT_ONCE).map(read))))
  }
  return results
}

/** Per section: the distinct guardians of its active participants on `date`, and those with an active account. */
async function accountsBySection(
  container: AwilixContainer,
  scope: ActivitiesScope,
  sectionIds: readonly string[],
  date: CalendarDate,
  timeZone: string,
): Promise<Map<string, IndicatorCounts>> {
  const groups = await listGroupsInSections(container, scope, sectionIds)
  const rosters = await inBatches(groups, (group) => rosterOn(container, scope, group.id, date))
  const wardsBySection = new Map<string, Set<string>>()
  groups.forEach((group, index) => {
    const wards = wardsBySection.get(group.sectionId) ?? new Set<string>()
    for (const member of rosters[index]) if (member.role === 'participant') wards.add(member.personId)
    wardsBySection.set(group.sectionId, wards)
  })
  const allWards = [...new Set([...wardsBySection.values()].flatMap((wards) => [...wards]))]
  const guardiansOf =
    allWards.length === 0 ? new Map<string, string[]>() : await activeGuardians(container, scope, allWards, date)
  const allGuardians = [...new Set([...guardiansOf.values()].flat())]
  const users =
    allGuardians.length === 0 ? new Map<string, string>() : await findUserIds(container, scope, allGuardians)
  const activeUsers = await activeAccountUserIds(
    container,
    scope,
    [...users.values()],
    zonedInstant(addCalendarDays(date, 1), '00:00', timeZone),
  )
  const activeGuardianIds = new Set(
    [...users.entries()].filter(([, userId]) => activeUsers.has(userId)).map(([personId]) => personId),
  )
  return new Map(
    sectionIds.map((sectionId) => {
      const guardians = [...(wardsBySection.get(sectionId) ?? [])].flatMap((ward) => guardiansOf.get(ward) ?? [])
      return [sectionId, countAccounts(guardians, activeGuardianIds)]
    }),
  )
}

type LogEntry = { createdAt: Date; contextJson?: unknown }
type ActionLogReader = { list(query: Record<string, unknown>): Promise<{ items: LogEntry[] }> }

/**
 * The first closing of a session's list by its deadline, from the session's action-log entries written up to the
 * deadline (one page: a few check-off saves at most); null without the audit log or without such an entry, which
 * leaves the session late. An undone check-off still counts: the undo never reopens a closed list (`check-off.ts`).
 */
async function loggedClosing(
  container: AwilixContainer,
  scope: ActivitiesScope,
  occurrenceId: string,
  endAt: Date,
): Promise<Date | null> {
  if (!container.hasRegistration(ACTION_LOG_SERVICE)) return null
  const logs = container.resolve<ActionLogReader>(ACTION_LOG_SERVICE)
  const { items } = await logs.list({
    ...scope,
    resourceKind: OCCURRENCE_RESOURCE_KIND,
    resourceId: occurrenceId,
    before: new Date(closeDeadline(endAt).getTime() + 1),
    sortField: 'createdAt',
    sortDir: 'asc',
    page: 1,
    pageSize: LOG_PAGE,
  })
  return firstClosing(items.map((entry) => ({ createdAt: entry.createdAt, context: entry.contextJson })))
}

export async function readPilotIndicators(
  container: AwilixContainer,
  scope: ActivitiesScope,
  input: { sectionIds: readonly string[]; period: SharePeriod; timeZone: string },
  now: Date = new Date(),
): Promise<PilotIndicatorsResult> {
  const { sectionIds, period, timeZone } = input
  const today = calendarDateInZone(now, timeZone)
  const paymentsEnabled = container.hasRegistration(PAYMENTS_PAID_ON_TIME)
  const em = container.resolve<EntityManager>('em').fork()
  const occurrences =
    sectionIds.length === 0
      ? []
      : await em.find(
          Occurrence,
          {
            ...scope,
            deletedAt: null,
            status: { $in: ['planned', 'done'] },
            sectionId: { $in: [...sectionIds] },
            occurrenceDate: { $gte: period.from, $lte: period.to },
            startAt: { $lte: now },
          },
          { fields: ['id', 'sectionId', 'status', 'startAt', 'endAt', 'updatedAt'] },
        )
  const ids = occurrences.map((row) => row.id)
  const [accounts, paid, substitutions] = await Promise.all([
    accountsBySection(container, scope, sectionIds, accountsDate(period, today), timeZone),
    paymentsEnabled
      ? container.resolve<PaidOnTimeReader>(PAYMENTS_PAID_ON_TIME).paidOnTime(scope, sectionIds, period, today)
      : Promise.resolve(null),
    ids.length === 0
      ? Promise.resolve([] as SubstitutionEntry[])
      : em
          .fork()
          .find(
            SubstitutionEntry,
            { ...scope, occurrenceId: { $in: ids } },
            { fields: ['occurrenceId', 'kind', 'createdAt'] },
          ),
  ])
  const lookups = occurrences.filter((row) =>
    needsCloseLookup({ status: row.status, endAt: row.endAt, updatedAt: row.updatedAt }),
  )
  const closings = await inBatches(lookups, (row) => loggedClosing(container, scope, row.id, row.endAt))
  const closedAt = new Map(lookups.map((row, index) => [row.id, closings[index]]))
  const entriesOf = new Map<string, CoverSession['entries'][number][]>()
  for (const entry of substitutions) {
    const list = entriesOf.get(entry.occurrenceId) ?? []
    list.push({ kind: entry.kind, createdAt: entry.createdAt })
    entriesOf.set(entry.occurrenceId, list)
  }
  const closingBySection = new Map<string, ClosingSession[]>()
  const coverBySection = new Map<string, CoverSession[]>()
  for (const row of occurrences) {
    const closing = closingBySection.get(row.sectionId) ?? []
    closing.push({
      status: row.status,
      endAt: row.endAt,
      updatedAt: row.updatedAt,
      closedAt: closedAt.get(row.id) ?? null,
    })
    closingBySection.set(row.sectionId, closing)
    const cover = coverBySection.get(row.sectionId) ?? []
    cover.push({ status: row.status, startAt: row.startAt, entries: entriesOf.get(row.id) ?? [] })
    coverBySection.set(row.sectionId, cover)
  }
  const bySection = new Map<string, PilotIndicators>(
    sectionIds.map((sectionId) => [
      sectionId,
      {
        accounts: value(accounts.get(sectionId) ?? { count: 0, total: 0 }),
        attendanceWithinDay: value(countClosedWithinDay(closingBySection.get(sectionId) ?? [], now)),
        paidOnTime: paid ? value(paid.get(sectionId) ?? { count: 0, total: 0 }) : null,
        coverBeforeStart: value(countCoveredBeforeStart(coverBySection.get(sectionId) ?? [], now)),
      },
    ]),
  )
  return { paymentsEnabled, bySection }
}
