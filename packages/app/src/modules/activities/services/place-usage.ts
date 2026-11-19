// The `activities` side of the undo guard of an added external place (club events spec REQ-T06, DD-T08; #377).
// `club_core` owns the contract (`club_core/services/place-usage.ts`) and resolves it with `hasRegistration`;
// `activities` registers it in `di.ts` under the token `club_core` names, so the dependency stays `activities` →
// `club_core`. A place is used by a live (`deleted_at IS NULL`) activity whose default place it is or a live session
// held there; the club events of phase 1 add their place here when they land.
import type { PlaceUsageContract } from '../../club_core/services/place-usage'
import { Activity, Occurrence } from '../data/entities'

/** The token `club_core` reads (`ACTIVITIES_PLACE_USAGE` in `club_core/services/place-usage.ts`). */
export const ACTIVITIES_PLACE_USAGE = 'activities.placeUsage'

export const placeUsage: PlaceUsageContract = {
  async isPlaceUsed(em, { tenantId, organizationId, placeId }) {
    const scope = { tenantId, organizationId, deletedAt: null }
    const activities = await em.count(Activity, { ...scope, defaultPlaceId: placeId })
    if (activities > 0) return true
    return (await em.count(Occurrence, { ...scope, placeId })) > 0
  },
}
