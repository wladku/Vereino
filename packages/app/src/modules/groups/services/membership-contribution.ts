// The `groups` side of the person scope and the role sync (club spec *Record scope*: `coached_group_ids` come from
// `coach`/`assistant` memberships; *Account payer*: an adult participant is their own payer). `people` owns the
// contract (`people/services/membership-contribution.ts`) and resolves it with `hasRegistration`; `groups` registers
// it in `di.ts` under the token `people` names, so the dependency stays `groups` → `people`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CalendarDate } from '@vereino/core'
import type {
  MembershipContribution,
  MembershipSubject,
  ParticipantGroup,
  ParticipantGroupFilter,
} from '../../people/services/membership-contribution'
import { Group, GroupMembership } from '../data/entities'
import { COACHING_ROLES, type MembershipRole } from '../lib/groups-rules'
import { clubGroupMembers } from './audience'

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

/** The live participant groups of the filter on `today` (#868); an empty id list in the filter matches nothing. */
async function participantGroups(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  filter: ParticipantGroupFilter,
  today: CalendarDate,
): Promise<ParticipantGroup[]> {
  const { personIds, groupIds, sectionIds } = filter
  if (personIds?.length === 0 || groupIds?.length === 0 || sectionIds?.length === 0) return []
  const groups = await em.find(
    Group,
    {
      ...scope,
      deletedAt: null,
      ...(groupIds ? { id: { $in: [...groupIds] } } : {}),
      ...(sectionIds ? { sectionId: { $in: [...sectionIds] } } : {}),
    },
    { fields: ['id', 'name', 'sectionId'] },
  )
  if (groups.length === 0) return []
  const byId = new Map(groups.map((group) => [group.id, group]))
  const memberships = await em.find(
    GroupMembership,
    {
      ...scope,
      groupId: { $in: [...byId.keys()] },
      ...(personIds ? { personId: { $in: [...personIds] } } : {}),
      role: 'participant',
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['id', 'groupId', 'personId'] },
  )
  const seen = new Set<string>()
  const rows: ParticipantGroup[] = []
  for (const membership of memberships) {
    const group = byId.get(membership.groupId)
    const key = `${membership.personId}:${membership.groupId}`
    if (!group || seen.has(key)) continue
    seen.add(key)
    rows.push({ personId: membership.personId, groupId: group.id, groupName: group.name, sectionId: group.sectionId })
  }
  return rows
}

export const membershipContribution: MembershipContribution = {
  coachedGroupIds: (em, subject, today) => activeGroupIds(em, subject, COACHING_ROLES, today),
  async isActiveParticipant(em, subject, today) {
    return (await activeGroupIds(em, subject, ['participant'], today)).length > 0
  },
  activeMembers: (em, scope, today) => clubGroupMembers(em, scope, today),
  participantGroups,
}
