// The optional `groups` hook that turns the bulk import's group column into participant memberships (club spec
// REQ-036, DD-38, D-026; #65). `groups` requires `people`, never the reverse, so `people` declares the contract here and
// reads it through DI with `hasRegistration`, as for `groups.membershipContribution`; `groups` registers it in its
// `di.ts`. Without the hook, a committed row with a group keeps `groups_not_enabled` (#28).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CalendarDate } from '@vereino/core'
import type { ClubScope } from './club-clock'

/** DI token under which `groups` registers its `MembershipImporter` (`groups/di.ts`; a protected surface, D-026). */
export const GROUPS_MEMBERSHIP_IMPORTER = 'groups.membershipImporter'

/** The group a name of the import names: exactly one live, active group of the club, none, or more than one. */
export type ImportGroupResolution =
  { status: 'resolved'; groupId: string } | { status: 'group_not_found' } | { status: 'group_ambiguous' }

/**
 * One participant membership the import asks for, open-ended from `validFrom` (the commit's day in the club zone);
 * `key` is the caller's (the import row id), unique within one call.
 */
export type ImportMembershipItem = { key: string; personId: string; groupId: string; validFrom: CalendarDate }

/**
 * What the hook did for one item: `created`, `existed` (a live participant membership of the person in the group
 * already covers `validFrom` or starts later, so nothing is written), `person_missing` (the person is no longer a live
 * person of the club) or `group_not_found` (the group was deleted since it was resolved).
 */
export type ImportMembershipOutcome =
  { status: 'created' | 'existed'; membershipId: string } | { status: 'person_missing' } | { status: 'group_not_found' }

export type ImportMembershipRun = {
  /** One outcome per item, by the item's `key`. */
  outcomes: Map<string, ImportMembershipOutcome>
  /** The events of the created memberships; the caller calls it after its transaction commits. */
  emitSideEffects(): Promise<void>
}

export type MembershipImporter = {
  /**
   * Resolves each name (trimmed, case-insensitive) against the live, active groups of the club; keyed by the names as
   * given. Reads with `em`, the caller's EntityManager. Never creates a group.
   */
  resolveGroups(
    em: EntityManager,
    scope: ClubScope,
    names: readonly string[],
  ): Promise<Map<string, ImportGroupResolution>>
  /**
   * Ensures each item's participant membership through the `groups.memberships.create` command, run nested in the
   * caller's transaction: `ctx` carries `transactionalEm` and the `bulkImport` suppression, so the memberships' events
   * wait for `emitSideEffects`. The caller's grant must allow the membership write (the club administrator's does).
   */
  ensureParticipantMemberships(
    ctx: CommandRuntimeContext,
    scope: ClubScope,
    items: readonly ImportMembershipItem[],
  ): Promise<ImportMembershipRun>
}

/** The registered hook, or null when `groups` is not enabled. */
export function membershipImporter(container: AwilixContainer): MembershipImporter | null {
  if (!container.hasRegistration(GROUPS_MEMBERSHIP_IMPORTER)) return null
  return container.resolve<MembershipImporter>(GROUPS_MEMBERSHIP_IMPORTER)
}
