// The optional `groups.personFilter` contract (UX parity spec REQ-U01, DD-U01): the people list's membership
// predicates — section, group, participant, coach by membership. `groups` requires `people`, never the reverse, so
// `people` declares the contract and reads it through DI with `hasRegistration`, the pattern of
// `groups.membershipContribution`. Without `groups` the list answers a group-based filter with 400
// `people_filter_unavailable` and drops the membership part of the staff and coach predicates.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate } from '@vereino/core'

/** DI token under which `groups` registers its `PersonFilterContract` (`groups/di.ts`). */
export const GROUPS_PERSON_FILTER = 'groups.personFilter'

/** The membership roles of `groups` (`participant`, `coach`, `assistant`). */
export type PersonFilterMembershipRole = 'participant' | 'coach' | 'assistant'

export type PersonFilterQuery = {
  tenantId: string
  organizationId: string
  /** The club's date on which a membership must be active. */
  on: CalendarDate
  /** Only memberships of the live groups of this section. */
  sectionId?: string
  /** Only memberships of this live group. */
  groupId?: string
  /** Only memberships of these roles (every role when absent). */
  membershipRoles?: readonly PersonFilterMembershipRole[]
}

export type PersonFilterContract = {
  /**
   * The distinct ids of the people with a membership of a live group active on `on` that matches every given
   * condition, in the trusted tenant and organization. Reads with `em`, the caller's EntityManager.
   */
  matchPersonIds(em: EntityManager, query: PersonFilterQuery): Promise<string[]>
}

/** The registered contract, or null when `groups` is not enabled. */
export function personFilterContract(container: AwilixContainer): PersonFilterContract | null {
  if (!container.hasRegistration(GROUPS_PERSON_FILTER)) return null
  return container.resolve<PersonFilterContract>(GROUPS_PERSON_FILTER)
}
