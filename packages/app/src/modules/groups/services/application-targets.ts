// `groups.applicationTargets` (sign-up form spec DD-J05, REQ-J01; Ask First approved on #788, 2026-11-26): the live
// groups of one section with their age fit rule on a date, their limit of places and the places taken on that date,
// for the section sign-up form (`enrolment`, phase 2) — so it never reads `groups_groups` through the ORM. An optional
// DI contract: the caller resolves it with `hasRegistration`. Every query carries the caller's tenant and organization.
//
// `lockGroupId` with the caller's `em` row-locks that group first (the lock `groups.memberships.create` takes, DD-J10a)
// and counts its places inside the caller's transaction, so two concurrent accepts into the last place serialize.
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate } from '@vereino/core'
import { Group, GroupMembership } from '../data/entities'
import { applicationTarget, type ApplicationTarget } from '../lib/application-targets'
import { summarizeRosters } from '../lib/group-list'
import { ageCategoryNames, isAgeCategoryEntry, rangesByEntry, seasonForReference } from './age-categories'
import type { GroupsScope } from './directory'

export const GROUPS_APPLICATION_TARGETS = 'groups.applicationTargets' as const

export type ApplicationTargetsQuery = {
  sectionId: string
  /** The application's reference date (or the start day on accept). */
  date: CalendarDate
  /** Only these groups of the section (all live groups of the section when absent). */
  groupIds?: readonly string[]
  /** Row-lock this group before counting (needs `em`, the caller's transaction). */
  lockGroupId?: string
  em?: EntityManager
}

export type ApplicationTargetsService = {
  applicationTargets(scope: GroupsScope, query: ApplicationTargetsQuery): Promise<ApplicationTarget[]>
}

export type { ApplicationTarget } from '../lib/application-targets'

async function participantMemberships(em: EntityManager, scope: GroupsScope, groupIds: string[], date: CalendarDate) {
  return em.find(
    GroupMembership,
    {
      ...scope,
      groupId: { $in: groupIds },
      role: 'participant',
      deletedAt: null,
      validFrom: { $lte: date },
      $or: [{ validTo: null }, { validTo: { $gte: date } }],
    },
    { fields: ['groupId', 'personId', 'role'] },
  )
}

/** The age category entries that are live entries of the club's dictionary and carry a "U" range. */
async function categoryRanges(em: EntityManager, scope: GroupsScope, groups: readonly Group[]) {
  const entryIds = [
    ...new Set(
      groups.flatMap((group) => (group.kind === 'team' && group.ageCategoryEntryId ? [group.ageCategoryEntryId] : [])),
    ),
  ]
  const live: string[] = []
  for (const entryId of entryIds) if (await isAgeCategoryEntry(em, scope, entryId)) live.push(entryId)
  return rangesByEntry(em, scope, live)
}

export function createApplicationTargets(container: AwilixContainer): ApplicationTargetsService {
  return {
    async applicationTargets(scope, query) {
      const em = query.em ?? container.resolve<EntityManager>('em').fork()
      if (query.lockGroupId) {
        await em.findOne(
          Group,
          { id: query.lockGroupId, ...scope, sectionId: query.sectionId, deletedAt: null },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        )
      }
      const groups = await em.find(
        Group,
        {
          ...scope,
          sectionId: query.sectionId,
          deletedAt: null,
          ...(query.groupIds ? { id: { $in: [...query.groupIds] } } : {}),
        },
        { orderBy: { name: 'asc', id: 'asc' } },
      )
      if (groups.length === 0) return []
      const ids = groups.map((group) => group.id)
      const [memberships, ranges, season, labels] = await Promise.all([
        participantMemberships(em, scope, ids, query.date),
        categoryRanges(em, scope, groups),
        seasonForReference(em, scope, null, query.date),
        ageCategoryNames(
          container,
          scope,
          groups.flatMap((group) => (group.ageCategoryEntryId ? [group.ageCategoryEntryId] : [])),
        ),
      ])
      const rosters = summarizeRosters(ids, memberships)
      const referenceSeason = season ? { startsOn: season.startsOn, endsOn: season.endsOn } : null
      return groups.map((group) => {
        const entryId = group.ageCategoryEntryId ?? null
        const range = entryId ? ranges.get(entryId) : undefined
        return applicationTarget(group, {
          date: query.date,
          referenceSeason,
          categoryRange: range ? { uFrom: range.uFrom, uTo: range.uTo ?? null } : null,
          ageCategoryLabel: entryId ? (labels.get(entryId) ?? null) : null,
          occupied: rosters.get(group.id)?.participantCount ?? 0,
        })
      })
    },
  }
}
