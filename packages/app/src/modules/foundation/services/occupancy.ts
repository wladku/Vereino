// P-26 contract (foundation II DD-G05): the optional occupancy provider a session preview and save consult for
// blocking intervals outside `activities` — bookings, rentals, closures and maintenance of the `facilities` module
// (phase 5). The foundation only names the token and its shape; `activities` resolves it with `hasRegistration` and
// never imports the implementing module. Absent → no extra intervals.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { Interval } from '@vereino/core'

/** DI token of the optional occupancy provider (registered by `facilities` in phase 5). */
export const OCCUPANCY_PROVIDER_TOKEN = 'vereino.occupancyProvider' as const

export type OccupancyReason = 'booking' | 'rental' | 'closure' | 'maintenance'

/** A blocking interval on a place, with the reason the 409 `occurrence_place_conflict` list shows. */
export type BlockingInterval = Interval & { readonly reason: OccupancyReason }

export type OccupancyContext = { tenantId: string; organizationId: string }

export type OccupancyProvider = {
  /** Blocking intervals on the given places that overlap `window`, in the caller's tenant and organization. */
  blockingIntervals(
    placeIds: readonly string[],
    window: { start: Date; end: Date },
    ctx: OccupancyContext,
  ): Promise<BlockingInterval[]>
}

/** The registered provider, or null when no module provides one. */
export function occupancyProvider(container: AwilixContainer): OccupancyProvider | null {
  if (!container.hasRegistration(OCCUPANCY_PROVIDER_TOKEN)) return null
  return container.resolve<OccupancyProvider>(OCCUPANCY_PROVIDER_TOKEN)
}

/**
 * The one occupancy lock of an organization (facilities spec DD-43): a transaction-scoped advisory lock that every
 * write adding occupancy takes before it checks and inserts — `activities`' session writes (through `lockSchedule`)
 * and `facilities`' rentals, bookings, closures and maintenance windows — so a check and its insert are atomic across
 * both modules. Held until the caller's transaction ends; take it before any row lock (lock order: occupancy, rows).
 */
export async function lockOccupancy(em: EntityManager, organizationId: string): Promise<void> {
  await em.execute(`select pg_advisory_xact_lock(hashtext('vereino.occupancy:' || ?))`, [organizationId])
}
