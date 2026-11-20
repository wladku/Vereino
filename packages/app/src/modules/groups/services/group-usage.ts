// The optional `activities.groupUsage` contract (groups and activities parity spec REQ-A02, REQ-A03; #266, #267): "does
// this group have matches" and "was this membership used". `activities` requires `groups`, never the reverse, so `groups` declares the contract and reads it
// through DI with `hasRegistration` — the pattern of `groups.sectionUsage` in `club_core`. Without `activities` no
// activity can reference a group, so an absent contract means no guard.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'

/** DI token under which `activities` registers its `GroupUsageContract` (`activities/di.ts`). */
export const ACTIVITIES_GROUP_USAGE = 'activities.groupUsage'

export type GroupUsageQuery = { tenantId: string; organizationId: string; groupId: string }

export type GroupsUsageScope = { tenantId: string; organizationId: string }

/** The persons of a group whose declarations from `from` on (inclusive) a move would drop. */
export type PendingDeclarationsQuery = GroupUsageQuery & { personIds: readonly string[]; from: string }

/** A membership's person and period (inclusive calendar days; `to` null = open-ended) in its group (REQ-A03). */
export type MembershipUsageQuery = GroupUsageQuery & { personId: string; from: string; to: string | null }

export type GroupUsageContract = {
  /**
   * The number of live (not soft-deleted) activities of type `match` or `sparring` of the group, active or not. Reads
   * with `em`, the caller's EntityManager, inside the command's transaction.
   */
  matchActivityCount(em: EntityManager, query: GroupUsageQuery): Promise<number>
  /**
   * Whether the membership was used (REQ-A03, #267): any attendance row of the person in a live session of the group
   * whose slot day lies within the period. Reads with `em` inside the command's transaction.
   */
  membershipUsed(em: EntityManager, query: MembershipUsageQuery): Promise<boolean>
  /**
   * The declarations a group move drops (people life-cycle spec REQ-L11, REQ-L15; #383): per person, the ids of their
   * live attendance rows without an actual mark in the group's live sessions on or after `from`. Reads with `em` inside
   * the command's transaction; a person without such rows is absent.
   */
  pendingDeclarations(em: EntityManager, query: PendingDeclarationsQuery): Promise<Map<string, string[]>>
  /**
   * Drops (soft-deletes) those of `attendanceIds` that are still live and unmarked, in the caller's transaction; the ids
   * dropped. The `activities` subscriber on `groups.membership.updated` would drop the same rows after the commit; a
   * bulk move drops them in its own transaction so its undo can restore exactly them.
   */
  dropDeclarations(em: EntityManager, scope: GroupsUsageScope, attendanceIds: readonly string[]): Promise<string[]>
  /**
   * Restores dropped rows among `attendanceIds` (the undo of a bulk move): a row still unmarked comes back unless the
   * person declared the same session again since. The number restored.
   */
  restoreDeclarations(em: EntityManager, scope: GroupsUsageScope, attendanceIds: readonly string[]): Promise<number>
}

/** The registered contract, or null when `activities` is not enabled. */
export function groupUsageContract(container: AwilixContainer): GroupUsageContract | null {
  if (!container.hasRegistration(ACTIVITIES_GROUP_USAGE)) return null
  return container.resolve<GroupUsageContract>(ACTIVITIES_GROUP_USAGE)
}
