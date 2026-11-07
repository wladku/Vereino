// The records of the modules `facilities` requires (facilities spec *Architecture*: `facilities` → `activities`,
// `club_core`, `people`), read through their DI services, never through their entities: places, the place tree, the
// institutions and the inherited opening hours (`clubCoreDirectory`, `clubCorePlaces`), the club time zone
// (`clubCoreSettings`), persons' names (`people.personDirectory`) and the planned sessions on places with the
// reschedule flag (`activities.placeSessions`). Every required module is enabled
// with `facilities`, so a missing registration is a deployment error and fails closed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { OpeningHours } from '@vereino/core'
import type { ActivitiesPlaceSessions, PlaceSessionEntry } from '../../activities/services/place-sessions'
import type { ClubCoreDirectory, PlaceDirectoryEntry, PlaceFamily } from '../../club_core/services/directory'
import type { ClubCorePlacesService } from '../../club_core/services/places'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import type { PersonDirectory } from '../../people/services/person-directory'

/** Tokens of the required modules' services (`club_core/di.ts`, `activities/di.ts`). */
const CLUB_CORE_DIRECTORY = 'clubCoreDirectory'
const CLUB_CORE_PLACES = 'clubCorePlaces'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'
const ACTIVITIES_PLACE_SESSIONS = 'activities.placeSessions'
const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'

export type FacilitiesScope = { tenantId: string; organizationId: string }

function assertRegistered(container: AwilixContainer, token: string): void {
  if (!container.hasRegistration(token)) throw new Error('[internal] facilities requires the DI service ' + token)
}

function directory(container: AwilixContainer): ClubCoreDirectory {
  assertRegistered(container, CLUB_CORE_DIRECTORY)
  return container.resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
}

function placeSessions(container: AwilixContainer): ActivitiesPlaceSessions {
  assertRegistered(container, ACTIVITIES_PLACE_SESSIONS)
  return container.resolve<ActivitiesPlaceSessions>(ACTIVITIES_PLACE_SESSIONS)
}

export function findPlaces(
  container: AwilixContainer,
  scope: FacilitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, PlaceDirectoryEntry>> {
  return directory(container).findPlaces(scope, ids, em)
}

export function placeFamily(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeId: string,
  em?: EntityManager,
): Promise<PlaceFamily | null> {
  return directory(container).placeFamily(scope, placeId, em)
}

export function openingHours(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  em?: EntityManager,
): Promise<Map<string, OpeningHours | null>> {
  assertRegistered(container, CLUB_CORE_PLACES)
  return container.resolve<ClubCorePlacesService>(CLUB_CORE_PLACES).openingHours(scope, placeIds, em)
}

export async function clubTimeZone(container: AwilixContainer, scope: FacilitiesScope): Promise<string> {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  return (await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope)).values.timezone
}

export function plannedSessions(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
  em?: EntityManager,
): Promise<PlaceSessionEntry[]> {
  return placeSessions(container).plannedSessions(scope, placeIds, window, em)
}

export function flagSessionsForReschedule(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
): Promise<string[]> {
  return placeSessions(container).flagForReschedule(scope, placeIds, window)
}

/** The names of live institutions of the club among `ids`, by id (a rental's renter, #122). */
export async function institutionNames(
  container: AwilixContainer,
  scope: FacilitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, string>> {
  const found = await directory(container).findInstitutions(scope, ids, em)
  return new Map([...found.values()].map((entry) => [entry.id, entry.name]))
}

/** The full names of live persons of the club among `ids`, by id (a rental's renter, #122). */
export async function personNames(
  container: AwilixContainer,
  scope: FacilitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, string>> {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  const found = await container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY).findPersons(scope, ids, em)
  return new Map([...found.values()].map((entry) => [entry.id, `${entry.firstName} ${entry.lastName}`.trim()]))
}
