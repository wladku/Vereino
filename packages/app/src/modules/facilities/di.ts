import { asFunction, asValue } from 'awilix'
import { registerNotificationTypes } from '@open-mercato/core/modules/notifications/lib/notification-type-registry'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { OCCUPANCY_PROVIDER_TOKEN, registerEmailTemplate } from '@/modules/foundation'
import { requestEmailTemplates } from './emails/templates'
import notificationTypes from './notifications'
import { FACILITIES_OCCUPANCY_SERVICE, createOccupancyService } from './services/occupancy'
import { createPublicPlacesBlock } from './services/public-schedule'
import { FACILITIES_REQUEST_LINKS, createRequestLinkService } from './services/requests'

/** The club page block of the public places (club spec DD-28; #124), read by `club_core` with `hasRegistration`. */
export const FACILITIES_PUBLIC_PLACES = 'facilities.publicPlaces' as const

/**
 * `facilities.occupancyService` (facilities spec DD-25; #122): the rentals and closures that block a place in a window,
 * as blocking intervals. The same service is registered as `vereino.occupancyProvider` (DD-20, foundation II P-26), which the `activities` session preview and
 * save resolve with `hasRegistration`, so a new session on a rented or closed slot answers 409
 * `occurrence_place_conflict` with the reason `rental` or `closure`. `facilities.publicPlaces` links the club page to
 * the public places (P-01 → P-03, #124).
 *
 * `facilities.requestLinks` (DD-44, #125): the P-10 single-use link on `facilities_rentals` (1 h) — the single DD-35
 * lookup of the request's token hash. The request e-mail templates (P-31) are registered for every request and job
 * container, so the dispatch worker finds them, and the in-app types are added to the platform's registry.
 */
const requestLinkService = createRequestLinkService()

export function register(container: AppContainer) {
  registerNotificationTypes(notificationTypes)
  for (const template of requestEmailTemplates) registerEmailTemplate(container, template)
  const service = asFunction((cradle: { em: EntityManager }) => createOccupancyService(() => cradle.em))
    .scoped()
    .proxy()
  container.register({
    [FACILITIES_OCCUPANCY_SERVICE]: service,
    [OCCUPANCY_PROVIDER_TOKEN]: service,
    [FACILITIES_PUBLIC_PLACES]: asFunction(() => createPublicPlacesBlock(container)).scoped(),
    [FACILITIES_REQUEST_LINKS]: asValue(requestLinkService),
  })
}
