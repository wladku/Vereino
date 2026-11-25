import { asFunction, asValue } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { createClubCoreContracts } from './services/contracts'
import { CLUB_CORE_DATA_EXPORT_CONTRIBUTOR, dataExportContribution } from './services/data-export-contribution'
import { CLUB_CORE_DEPARTURE_CONTRIBUTOR, departureContribution } from './services/departure-contribution'
import { createClubCoreDirectory } from './services/directory'
import { createClubCorePlacesService } from './services/places'
import { createClubCorePublicSite } from './services/public-site'
import { createClubCoreSettingsService } from './services/settings'
import { registerClubDataContributor } from '@/modules/foundation'
import { CLUB_CORE_CLUB_TABLES } from './lib/club-tables'

/** DI token of the club settings service (foundation spec DD-F16): `get({ tenantId, organizationId })`. */
export const CLUB_CORE_SETTINGS_SERVICE = 'clubCoreSettings' as const

/**
 * DI token of the places service (club spec glossary *Place*): `assertBookableLeaf(scope, placeId, em?)`, called by
 * the session and booking commands of phases 2 and 5, and `openingHours(scope, placeIds, em?)`, the inherited opening
 * hours `facilities` checks zone rules and bookings against (facilities spec DD-41).
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

/**
 * DI token of the contracts read side (#96): `settlement(scope)` — the club's coach settlement model and currency — and
 * `coachContracts(scope, personIds, from, to)`, the coach contracts with their rates, for the coach units report — and
 * `facilityAgreement(scope, institutionId, on, em?)`, the rental terms of the management agreement with a place's owner
 * in force on a day, for `facilities` (#284).
 */
export const CLUB_CORE_CONTRACTS = 'clubCoreContracts' as const

export { PUBLIC_BLOCK_PROVIDER_TOKENS } from './services/public-blocks'

export function register(container: AppContainer) {
  registerClubDataContributor(container, 'club_core', CLUB_CORE_CLUB_TABLES)
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
    [CLUB_CORE_CONTRACTS]: asFunction((cradle: { em: EntityManager }) => createClubCoreContracts(() => cradle.em))
      .scoped()
      .proxy(),
    // `people.departure.club_core` (people life-cycle spec REQ-L04, #307): the departure contributor `people` reads with
    // `hasRegistration` — a leaving person's contracts end on the last day, with the undo and the contract events after
    // the commit. Stateless: the caller's EntityManager, inside the departure's transaction.
    [CLUB_CORE_DEPARTURE_CONTRIBUTOR]: asValue(departureContribution),
    // `people.dataExport.club_core` (person data export spec DD-X01, #527): the subject's contracts for the art. 15/20
    // file, which `people` reads with `hasRegistration`. Stateless: the caller's EntityManager.
    [CLUB_CORE_DATA_EXPORT_CONTRIBUTOR]: asValue(dataExportContribution),
    // The request container is passed in, so the optional block providers are found with `hasRegistration`.
    [CLUB_CORE_PUBLIC_SITE]: asFunction((cradle: { em: EntityManager }) =>
      createClubCorePublicSite(() => cradle.em, container),
    )
      .scoped()
      .proxy(),
  })
}
