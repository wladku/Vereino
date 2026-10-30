import { asFunction } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createClubCoreDirectory } from './services/directory'
import { createClubCorePlacesService } from './services/places'
import { createClubCorePublicSite } from './services/public-site'
import { createClubCoreSettingsService } from './services/settings'

/** DI token of the club settings service (foundation spec DD-F16): `get({ tenantId, organizationId })`. */
export const CLUB_CORE_SETTINGS_SERVICE = 'clubCoreSettings' as const

/**
 * DI token of the places service (club spec glossary *Place*): `assertBookableLeaf(scope, placeId, em?)`, called by
 * the session and booking commands of phases 2 and 5.
 */
export const CLUB_CORE_PLACES_SERVICE = 'clubCorePlaces' as const

/**
 * DI token of the directory (#30, #31): `findSections`, `findInstitutions`, `findPlaces` (scope, ids, em?) — the live
 * sections, institutions and places of a club by id — and `placeFamily(scope, placeId, em?)`, a place with its
 * ancestors and descendants, for `groups` and `activities`.
 */
export const CLUB_CORE_DIRECTORY = 'clubCoreDirectory' as const

/**
 * DI token of the sessionless public pages (club spec DD-28, DD-35; #29): `clubPage`, `sectionPage`, `clubLogo`,
 * `sectionLogo`, `material` by public slug. The only Vereino service allowed the system-scope slug lookup (AGENTS.md
 * exception); it reads the optional block providers of `services/public-blocks.ts` with `hasRegistration`.
 */
export const CLUB_CORE_PUBLIC_SITE = 'clubCorePublicSite' as const

export { PUBLIC_BLOCK_PROVIDER_TOKENS } from './services/public-blocks'

export function register(container: AppContainer) {
  container.register({
    // `.proxy()` resolves `em` by property name, which survives bundler renaming under CLASSIC injection.
    [CLUB_CORE_SETTINGS_SERVICE]: asFunction((cradle: { em: EntityManager }) =>
      createClubCoreSettingsService(() => cradle.em),
    )
      .scoped()
      .proxy(),
    [CLUB_CORE_PLACES_SERVICE]: asFunction((cradle: { em: EntityManager }) =>
      createClubCorePlacesService(() => cradle.em),
    )
      .scoped()
      .proxy(),
    [CLUB_CORE_DIRECTORY]: asFunction((cradle: { em: EntityManager }) => createClubCoreDirectory(() => cradle.em))
      .scoped()
      .proxy(),
    // The request container is passed in, so the optional block providers are found with `hasRegistration`.
    [CLUB_CORE_PUBLIC_SITE]: asFunction((cradle: { em: EntityManager }) =>
      createClubCorePublicSite(() => cradle.em, container),
    )
      .scoped()
      .proxy(),
  })
}
