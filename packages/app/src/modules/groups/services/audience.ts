// The audience providers `groups` owns (foundation III P-29, DD-M05; #71): `vereino.audience.section` and
// `vereino.audience.group` — the participants and the coaches (`coach`, `assistant`) of the live groups of the named
// sections, or of the named groups, whose membership is active on the club's date. Inactive groups are left out of a
// section audience but kept when named directly. Unknown ids yield nobody: the consuming command authorizes the target
// before it resolves the audience. The foundation resolves the providers with `hasRegistration`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AudienceMember, AudienceSpec, CalendarDate } from '@vereino/core'
import type { AudienceProvider, AudienceProviderContext } from '@/modules/foundation'
import { Group, GroupMembership } from '../data/entities'
import { isCoachingRole } from '../lib/groups-rules'
import type { GroupsScope } from './directory'

function emOf(ctx: AudienceProviderContext): EntityManager {
  return ctx.em ?? ctx.container.resolve<EntityManager>('em').fork()
}

/** The members of the live groups among `groupIds` on `today`: participants and coaches, one entry per role. */
export async function groupMembers(
  em: EntityManager,
  scope: GroupsScope,
  groupIds: readonly string[],
  today: CalendarDate,
): Promise<AudienceMember[]> {
  const unique = [...new Set(groupIds)]
  if (unique.length === 0) return []
  const live = await em.find(Group, { ...scope, id: { $in: unique }, deletedAt: null }, { fields: ['id'] })
  if (live.length === 0) return []
  const memberships = await em.find(
    GroupMembership,
    {
      ...scope,
      groupId: { $in: live.map((group) => group.id) },
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['id', 'personId', 'role'] },
  )
  const members = new Map<string, AudienceMember>()
  for (const row of memberships) {
    const reason = isCoachingRole(row.role) ? 'coach' : 'participant'
    members.set(`${row.personId}:${reason}`, { personId: row.personId, reason })
  }
  return [...members.values()]
}

function scopeOf(ctx: AudienceProviderContext): GroupsScope {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

/** `vereino.audience.group`: the members of the named groups. */
export const groupAudienceProvider: AudienceProvider = {
  async members(spec: AudienceSpec, ctx: AudienceProviderContext) {
    return groupMembers(emOf(ctx), scopeOf(ctx), spec.ids ?? [], ctx.today)
  },
}

/** `vereino.audience.section`: the members of the live, active groups of the named sections. */
export const sectionAudienceProvider: AudienceProvider = {
  async members(spec: AudienceSpec, ctx: AudienceProviderContext) {
    const sectionIds = [...new Set(spec.ids ?? [])]
    if (sectionIds.length === 0) return []
    const em = emOf(ctx)
    const scope = scopeOf(ctx)
    const groups = await em.find(
      Group,
      { ...scope, sectionId: { $in: sectionIds }, isActive: true, deletedAt: null },
      { fields: ['id'] },
    )
    return groupMembers(
      em,
      scope,
      groups.map((group) => group.id),
      ctx.today,
    )
  },
}

/** The members of every live, active group of the club on `today` (the `people` club audience reads it). */
export async function clubGroupMembers(
  em: EntityManager,
  scope: GroupsScope,
  today: CalendarDate,
): Promise<AudienceMember[]> {
  const groups = await em.find(Group, { ...scope, isActive: true, deletedAt: null }, { fields: ['id'] })
  return groupMembers(
    em,
    scope,
    groups.map((group) => group.id),
    today,
  )
}
