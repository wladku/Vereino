import { asFunction } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { OCCUPANCY_PROVIDER_TOKEN } from '@/modules/foundation'
import { FACILITIES_OCCUPANCY_SERVICE, createOccupancyService } from './services/occupancy'

/**
 * `facilities.occupancyService` (facilities spec DD-25; #122): the rentals and closures that block a place in a window,
 * as blocking intervals. The same service is registered as `vereino.occupancyProvider` (DD-20, foundation II P-26), which the `activities` session preview and
 * save resolve with `hasRegistration`, so a new session on a rented or closed slot answers 409
 * `occurrence_place_conflict` with the reason `rental` or `closure`.
 */
export function register(container: AppContainer) {
  const service = asFunction((cradle: { em: EntityManager }) => createOccupancyService(() => cradle.em))
    .scoped()
    .proxy()
  container.register({
    [FACILITIES_OCCUPANCY_SERVICE]: service,
    [OCCUPANCY_PROVIDER_TOKEN]: service,
  })
}
