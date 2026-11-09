import { asFunction } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { OCCUPANCY_PROVIDER_TOKEN } from '@/modules/foundation'
import { FACILITIES_OCCUPANCY_SERVICE, createOccupancyService } from './services/occupancy'
import { createPublicPlacesBlock } from './services/public-schedule'

/** The club page block of the public places (club spec DD-28; #124), read by `club_core` with `hasRegistration`. */
export const FACILITIES_PUBLIC_PLACES = 'facilities.publicPlaces' as const

/**
 * `facilities.occupancyService` (facilities spec DD-25; #122): the rentals and closures that block a place in a window,
 * as blocking intervals. The same service is registered as `vereino.occupancyProvider` (DD-20, foundation II P-26), which the `activities` session preview and
 * save resolve with `hasRegistration`, so a new session on a rented or closed slot answers 409
 * `occurrence_place_conflict` with the reason `rental` or `closure`. `facilities.publicPlaces` links the club page to
 * the public places (P-01 → P-03, #124).
 */
export function register(container: AppContainer) {
  const service = asFunction((cradle: { em: EntityManager }) => createOccupancyService(() => cradle.em))
    .scoped()
    .proxy()
  container.register({
    [FACILITIES_OCCUPANCY_SERVICE]: service,
    [OCCUPANCY_PROVIDER_TOKEN]: service,
    [FACILITIES_PUBLIC_PLACES]: asFunction(() => createPublicPlacesBlock(container)).scoped(),
  })
}
