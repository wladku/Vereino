// The optional `groups` contribution to the person scope and the role sync (club spec *Record scope*: a coach's
// `coached_group_ids` come from `coach`/`assistant` memberships; *Account payer*: an adult participant is their own
// payer). `groups` requires `people`, never the reverse, so `people` declares the contract and reads it through DI
// with `hasRegistration` — the pattern the club spec names for `facilities.maintainerScopeProvider`. Without `groups`
// the contribution is absent: no coach grant and no participant payer (fail closed).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { AudienceMember, CalendarDate } from '@vereino/core'

/** DI token under which `groups` registers its `MembershipContribution` (`groups/di.ts`). */
export const GROUPS_MEMBERSHIP_CONTRIBUTION = 'groups.membershipContribution'

/** The person whose memberships are read, in the trusted tenant and organization. */
export type MembershipSubject = { tenantId: string; organizationId: string; personId: string }

export type MembershipContribution = {
  /**
   * Ids of the live groups in which the person has a `coach` or `assistant` membership active on `today`. Reads with
   * `em`, the caller's EntityManager, so a caller inside a transaction sees its own writes.
   */
  coachedGroupIds(em: EntityManager, subject: MembershipSubject, today: CalendarDate): Promise<string[]>
  /** Whether the person has a `participant` membership of a live group active on `today`. */
  isActiveParticipant(em: EntityManager, subject: MembershipSubject, today: CalendarDate): Promise<boolean>
  /**
   * The participants and coaches of every live, active group of the club on `today` — the members of the `club`
   * audience `people` provides (foundation III P-29, #71).
   */
  activeMembers(
    em: EntityManager,
    scope: { tenantId: string; organizationId: string },
    today: CalendarDate,
  ): Promise<AudienceMember[]>
  /**
   * The live groups whose `participant` memberships are active on `today`, one entry per person and group, narrowed
   * by `filter` (personal invitation link spec IL-D03, #868: which families a coach or coordinator may invite). An
   * empty id list in the filter matches nothing.
   */
  participantGroups(
    em: EntityManager,
    scope: { tenantId: string; organizationId: string },
    filter: ParticipantGroupFilter,
    today: CalendarDate,
  ): Promise<ParticipantGroup[]>
}

/** A live group a person is a participant of on a date, with its section (personal invitation link spec IL-D03). */
export type ParticipantGroup = { personId: string; groupId: string; groupName: string; sectionId: string }

/** Which participants to read: the persons among `personIds`, in `groupIds`, in `sectionIds` (each optional, ANDed). */
export type ParticipantGroupFilter = {
  personIds?: readonly string[]
  groupIds?: readonly string[]
  sectionIds?: readonly string[]
}

/** The registered contribution, or null when `groups` is not enabled. */
export function membershipContribution(container: AwilixContainer): MembershipContribution | null {
  if (!container.hasRegistration(GROUPS_MEMBERSHIP_CONTRIBUTION)) return null
  return container.resolve<MembershipContribution>(GROUPS_MEMBERSHIP_CONTRIBUTION)
}
