// The optional `activities.placeUsage` contract (club events spec REQ-T06, DD-T08; #377): "does anything point at
// place X". The undo of an added external place removes it only while no activity, session or club event points at it.
// `activities` requires `club_core`, never the reverse, so `club_core` declares the contract and reads it through DI
// with `hasRegistration` — the pattern of `groups.sectionUsage`. Without `activities` nothing can point at a place
// from there, so an absent contract means the place is free.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'

/** DI token under which `activities` registers its `PlaceUsageContract` (`activities/di.ts`). */
export const ACTIVITIES_PLACE_USAGE = 'activities.placeUsage'

export type PlaceUsageQuery = { tenantId: string; organizationId: string; placeId: string }

export type PlaceUsageContract = {
  /**
   * True when a live activity, session or club event of the organization points at the place (soft-deleted rows do
   * not count). Reads with `em`, the caller's EntityManager, inside the command's transaction.
   */
  isPlaceUsed(em: EntityManager, query: PlaceUsageQuery): Promise<boolean>
}

/** The registered contract, or null when `activities` is not enabled. */
export function placeUsageContract(container: AwilixContainer): PlaceUsageContract | null {
  if (!container.hasRegistration(ACTIVITIES_PLACE_USAGE)) return null
  return container.resolve<PlaceUsageContract>(ACTIVITIES_PLACE_USAGE)
}
