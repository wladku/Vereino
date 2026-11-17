// The `activities` side of the group kind guard (groups and activities parity spec REQ-A02; #266). `groups` owns the
// contract (`groups/services/group-usage.ts`) and resolves it with `hasRegistration`; `activities` registers it in
// `di.ts` under the token `groups` names, so the dependency stays `activities` → `groups`. A match is a live
// (`deleted_at IS NULL`) activity of a team-only type (`match`, `sparring`), active or not.
import type { GroupUsageContract } from '../../groups/services/group-usage'
import { Activity } from '../data/entities'
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
}
