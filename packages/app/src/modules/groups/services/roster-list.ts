// The roster page of `GET /api/groups/memberships?sortField=roster` (parity spec REQ-A03, B-12; #267): coaches, then
// assistants, then participants, the latest start first within a role, paged on the server so every row of a long
// roster is reachable. The CRUD list sorts by one column only, so this order is read here with the ORM. The caller has
// resolved the groups the user may read (`readableGroupIds`); every query is narrowed to the trusted tenant and club.
import { raw, type FilterQuery } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate } from '@vereino/core'
import { GroupMembership } from '../data/entities'
import { rosterRoleRankSql, rosterViewBounds, type MembershipRole, type PeriodStatus } from '../lib/groups-rules'
import type { GroupsScope } from '../commands/shared'

export type RosterListFilter = {
  /** The groups the caller may read; `all` for the club administrator. */
  groupIds: readonly string[] | 'all'
  groupId?: string
  personId?: string
  role?: MembershipRole
  activeOn?: CalendarDate
  status?: PeriodStatus
  today: CalendarDate
}

export type RosterListPage = { rows: GroupMembership[]; total: number }

function rosterWhere(scope: GroupsScope, filter: RosterListFilter): FilterQuery<GroupMembership> {
  const conditions: FilterQuery<GroupMembership>[] = [{ ...scope, deletedAt: null }]
  if (filter.groupIds !== 'all') conditions.push({ groupId: { $in: [...filter.groupIds] } })
  if (filter.groupId) conditions.push({ groupId: filter.groupId })
  if (filter.personId) conditions.push({ personId: filter.personId })
  if (filter.role) conditions.push({ role: filter.role })
  if (filter.activeOn) {
    conditions.push({
      validFrom: { $lte: filter.activeOn },
      $or: [{ validTo: null }, { validTo: { $gte: filter.activeOn } }],
    })
  }
  if (filter.status) {
    const bounds = rosterViewBounds(filter.status, filter.today)
    if (bounds.view === 'active') {
      conditions.push({
        validFrom: { $lte: bounds.startsOnOrBefore },
        $or: [{ validTo: null }, { validTo: { $gte: bounds.endsOnOrAfter } }],
      })
    } else if (bounds.view === 'upcoming') {
      conditions.push({ validFrom: { $gt: bounds.startsAfter } })
    } else {
      conditions.push({ validTo: { $lt: bounds.endsBefore } })
    }
  }
  return { $and: conditions }
}

/** One page of the roster in the roster order, and the total of the filter. */
export async function rosterPage(
  container: AwilixContainer,
  scope: GroupsScope,
  filter: RosterListFilter,
  page: number,
  pageSize: number,
): Promise<RosterListPage> {
  if (filter.groupIds !== 'all' && filter.groupIds.length === 0) return { rows: [], total: 0 }
  const em = container.resolve<EntityManager>('em').fork()
  const where = rosterWhere(scope, filter)
  const [rows, total] = await em.findAndCount(GroupMembership, where, {
    // The keys of `rosterRoleOrder` (`lib/groups-rules.ts`): role rank, the latest start first, then the id.
    orderBy: [{ [raw(rosterRoleRankSql)]: 'asc' }, { validFrom: 'desc' }, { id: 'asc' }],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  return { rows, total }
}
