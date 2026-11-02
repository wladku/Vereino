// The audience providers `activities` owns (foundation III P-29, DD-M05; #71): `vereino.audience.activity` — the
// roster of each named activity's group on the club's date plus the activity's default coach — and
// `vereino.audience.occurrence` — the roster of each named session's group on the session's date (the people the
// session concerns, as for the phase 2 cancellation notice) plus the session's coach. Rosters come from
// `groups.directory`; unknown or deleted ids yield nobody (the consuming command authorizes the target first).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AudienceMember, AudienceSpec, CalendarDate } from '@vereino/core'
import type { AudienceProvider, AudienceProviderContext } from '@/modules/foundation'
import { Activity, Occurrence } from '../data/entities'
import { rosterOn, type ActivitiesScope } from './directory'

function emOf(ctx: AudienceProviderContext): EntityManager {
  return ctx.em ?? ctx.container.resolve<EntityManager>('em').fork()
}

function scopeOf(ctx: AudienceProviderContext): ActivitiesScope {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

/** The members of each (group, date) pair and the named coaches, one entry per person and reason. */
async function rosterMembers(
  ctx: AudienceProviderContext,
  targets: ReadonlyArray<{ groupId: string; date: CalendarDate; coachPersonId: string | null }>,
): Promise<AudienceMember[]> {
  const members = new Map<string, AudienceMember>()
  const add = (member: AudienceMember) => members.set(`${member.personId}:${member.reason}`, member)
  const seen = new Set<string>()
  for (const target of targets) {
    const key = `${target.groupId}:${target.date}`
    if (!seen.has(key)) {
      seen.add(key)
      for (const entry of await rosterOn(ctx.container, scopeOf(ctx), target.groupId, target.date, ctx.em)) {
        add({ personId: entry.personId, reason: entry.role === 'participant' ? 'participant' : 'coach' })
      }
    }
    if (target.coachPersonId) add({ personId: target.coachPersonId, reason: 'coach' })
  }
  return [...members.values()]
}

/** `vereino.audience.activity`: the group roster of each named activity on the club's date and its default coach. */
export const activityAudienceProvider: AudienceProvider = {
  async members(spec: AudienceSpec, ctx: AudienceProviderContext) {
    const ids = [...new Set(spec.ids ?? [])]
    if (ids.length === 0) return []
    const activities = await emOf(ctx).find(
      Activity,
      { ...scopeOf(ctx), id: { $in: ids }, deletedAt: null },
      { fields: ['id', 'groupId', 'defaultCoachPersonId'] },
    )
    return rosterMembers(
      ctx,
      activities.map((activity) => ({
        groupId: activity.groupId,
        date: ctx.today,
        coachPersonId: activity.defaultCoachPersonId ?? null,
      })),
    )
  },
}

/** `vereino.audience.occurrence`: the group roster of each named session on its date and the session's coach. */
export const occurrenceAudienceProvider: AudienceProvider = {
  async members(spec: AudienceSpec, ctx: AudienceProviderContext) {
    const ids = [...new Set(spec.ids ?? [])]
    if (ids.length === 0) return []
    const occurrences = await emOf(ctx).find(
      Occurrence,
      { ...scopeOf(ctx), id: { $in: ids }, deletedAt: null },
      { fields: ['id', 'groupId', 'occurrenceDate', 'coachPersonId'] },
    )
    return rosterMembers(
      ctx,
      occurrences.map((occurrence) => ({
        groupId: occurrence.groupId,
        date: occurrence.occurrenceDate,
        coachPersonId: occurrence.coachPersonId ?? null,
      })),
    )
  },
}
