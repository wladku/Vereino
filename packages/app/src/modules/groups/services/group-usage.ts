// The optional `activities.groupUsage` contract (groups and activities parity spec REQ-A02, REQ-A03; #266): "does this
// group have matches". `activities` requires `groups`, never the reverse, so `groups` declares the contract and reads it
// through DI with `hasRegistration` — the pattern of `groups.sectionUsage` in `club_core`. Without `activities` no
// activity can reference a group, so an absent contract means no guard.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'

/** DI token under which `activities` registers its `GroupUsageContract` (`activities/di.ts`). */
export const ACTIVITIES_GROUP_USAGE = 'activities.groupUsage'

export type GroupUsageQuery = { tenantId: string; organizationId: string; groupId: string }

export type GroupUsageContract = {
  /**
   * The number of live (not soft-deleted) activities of type `match` or `sparring` of the group, active or not. Reads
   * with `em`, the caller's EntityManager, inside the command's transaction.
   */
  matchActivityCount(em: EntityManager, query: GroupUsageQuery): Promise<number>
}

/** The registered contract, or null when `activities` is not enabled. */
export function groupUsageContract(container: AwilixContainer): GroupUsageContract | null {
  if (!container.hasRegistration(ACTIVITIES_GROUP_USAGE)) return null
  return container.resolve<GroupUsageContract>(ACTIVITIES_GROUP_USAGE)
}
