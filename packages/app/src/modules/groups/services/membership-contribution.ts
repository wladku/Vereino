// The `groups` side of the person scope and the role sync (club spec *Record scope*: `coached_group_ids` come from
// `coach`/`assistant` memberships; *Account payer*: an adult participant is their own payer). `people` owns the
// contract (`people/services/membership-contribution.ts`) and resolves it with `hasRegistration`; `groups` registers
// it in `di.ts` under the token `people` names, so the dependency stays `groups` → `people`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CalendarDate } from '@vereino/core'
import type { MembershipContribution, MembershipSubject } from '../../people/services/membership-contribution'
import { Group, GroupMembership } from '../data/entities'
import { COACHING_ROLES, type MembershipRole } from '../lib/groups-rules'

/** The token `people` reads (`GROUPS_MEMBERSHIP_CONTRIBUTION` in `people/services/membership-contribution.ts`). */
export const GROUPS_MEMBERSHIP_CONTRIBUTION = 'groups.membershipContribution'

/** Live group ids among the memberships of `roles` the person holds on `today`. */
async function activeGroupIds(
  em: EntityManager,
  subject: MembershipSubject,
  roles: readonly MembershipRole[],
  today: CalendarDate,
): Promise<string[]> {
  const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
  const memberships = await em.find(
    GroupMembership,
    {
      ...scope,
      personId: subject.personId,
      role: { $in: [...roles] },
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['id', 'groupId'] },
  )
  const groupIds = [...new Set(memberships.map((row) => row.groupId))]
  if (groupIds.length === 0) return []
  const groups = await em.find(Group, { ...scope, id: { $in: groupIds }, deletedAt: null }, { fields: ['id'] })
  return groups.map((row) => row.id).sort()
}

export const membershipContribution: MembershipContribution = {
  coachedGroupIds: (em, subject, today) => activeGroupIds(em, subject, COACHING_ROLES, today),
  async isActiveParticipant(em, subject, today) {
    return (await activeGroupIds(em, subject, ['participant'], today)).length > 0
  },
}
