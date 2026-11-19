// The `activities` side of the group kind guard and of the roster's Remove (groups and activities parity spec REQ-A02,
// REQ-A03; #266, #267). `groups` owns the
// contract (`groups/services/group-usage.ts`) and resolves it with `hasRegistration`; `activities` registers it in
// `di.ts` under the token `groups` names, so the dependency stays `activities` → `groups`. A match is a live
// (`deleted_at IS NULL`) activity of a team-only type (`match`, `sparring`), active or not. A membership is used when
// the person has a live attendance row in a live session of the group whose slot day lies within its period.
import type { GroupUsageContract } from '../../groups/services/group-usage'
import { Activity } from '../data/entities'
import { TEAM_ONLY_TYPES } from '../lib/activities-rules'

/** The token `groups` reads (`ACTIVITIES_GROUP_USAGE` in `groups/services/group-usage.ts`). */
export const ACTIVITIES_GROUP_USAGE = 'activities.groupUsage'

/** The columns `membershipUsed` reads, typed for the Kysely query. */
type GroupUsageDatabase = {
  activities_attendances: {
    id: string
    tenant_id: string
    organization_id: string
    occurrence_id: string
    person_id: string
    deleted_at: Date | null
  }
  activities_occurrences: {
    id: string
    tenant_id: string
    organization_id: string
    group_id: string
    occurrence_date: string
    deleted_at: Date | null
  }
}

export const groupUsage: GroupUsageContract = {
  matchActivityCount(em, { tenantId, organizationId, groupId }) {
    return em.count(Activity, {
      tenantId,
      organizationId,
      groupId,
      type: { $in: [...TEAM_ONLY_TYPES] },
      deletedAt: null,
    })
  },
  async membershipUsed(em, { tenantId, organizationId, groupId, personId, from, to }) {
    // One indexed query (#359): the person's live attendance joined to the group's live sessions in the period. Read
    // through the EntityManager's Kysely client, which stays on the command's transaction.
    let query = em
      .getKysely<GroupUsageDatabase>()
      .selectFrom('activities_attendances as a')
      .innerJoin('activities_occurrences as o', 'o.id', 'a.occurrence_id')
      .select('a.id')
      .where('a.tenant_id', '=', tenantId)
      .where('a.organization_id', '=', organizationId)
      .where('a.person_id', '=', personId)
      .where('a.deleted_at', 'is', null)
      .where('o.tenant_id', '=', tenantId)
      .where('o.organization_id', '=', organizationId)
      .where('o.group_id', '=', groupId)
      .where('o.deleted_at', 'is', null)
      .where('o.occurrence_date', '>=', from)
    if (to) query = query.where('o.occurrence_date', '<=', to)
    const used = await query.limit(1).executeTakeFirst()
    return used !== undefined
  },
}
