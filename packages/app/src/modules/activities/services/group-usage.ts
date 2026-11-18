// The `activities` side of the group kind guard and of the roster's Remove (groups and activities parity spec REQ-A02,
// REQ-A03; #266, #267). `groups` owns the
// contract (`groups/services/group-usage.ts`) and resolves it with `hasRegistration`; `activities` registers it in
// `di.ts` under the token `groups` names, so the dependency stays `activities` → `groups`. A match is a live
// (`deleted_at IS NULL`) activity of a team-only type (`match`, `sparring`), active or not. A membership is used when
// the person has a live attendance row in a live session of the group whose slot day lies within its period.
import type { GroupUsageContract } from '../../groups/services/group-usage'
import { Activity, Attendance, Occurrence } from '../data/entities'
import { TEAM_ONLY_TYPES } from '../lib/activities-rules'

/** The token `groups` reads (`ACTIVITIES_GROUP_USAGE` in `groups/services/group-usage.ts`). */
export const ACTIVITIES_GROUP_USAGE = 'activities.groupUsage'

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
    // The person's attendance rows first (indexed by person), then the group's sessions among them in the period.
    const rows = await em.find(
      Attendance,
      { tenantId, organizationId, personId, deletedAt: null },
      { fields: ['occurrenceId'] },
    )
    if (rows.length === 0) return false
    const sessions = await em.count(Occurrence, {
      tenantId,
      organizationId,
      groupId,
      id: { $in: [...new Set(rows.map((row) => row.occurrenceId))] },
      occurrenceDate: to ? { $gte: from, $lte: to } : { $gte: from },
      deletedAt: null,
    })
    return sessions > 0
  },
}
