// The records of the modules `facilities` requires (facilities spec *Architecture*: `facilities` → `activities`,
// `club_core`, `people`), read through their DI services, never through their entities: places, the place tree, the
// institutions and the inherited opening hours (`clubCoreDirectory`, `clubCorePlaces`), the rental terms of the
// management agreement with a place's owner (`clubCoreContracts`, #284), the club time zone
// (`clubCoreSettings`), persons' names (`people.personDirectory`) and the planned sessions on places with the
// reschedule flag (`activities.placeSessions`). Every required module is enabled
// with `facilities`, so a missing registration is a deployment error and fails closed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate, OpeningHours } from '@vereino/core'
import type {
  ActivitiesPlaceSessions,
  DoneSessionReportEntry,
  PlaceSessionEntry,
} from '../../activities/services/place-sessions'
import type {
  ClubCoreDirectory,
  InstitutionSearchEntry,
  PlaceDirectoryEntry,
  PlaceFamily,
  PlaceOption,
  PlacePayee,
  RentedPlace,
  SectionDirectoryEntry,
} from '../../club_core/services/directory'
import type { FacilityAgreement } from '../../club_core/lib/contracts'
import type { ClubCoreContracts } from '../../club_core/services/contracts'
import type { ClubCorePlacesService } from '../../club_core/services/places'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import type { PersonDirectory } from '../../people/services/person-directory'

/** Tokens of the required modules' services (`club_core/di.ts`, `activities/di.ts`). */
const CLUB_CORE_DIRECTORY = 'clubCoreDirectory'
const CLUB_CORE_PLACES = 'clubCorePlaces'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'
const CLUB_CORE_CONTRACTS = 'clubCoreContracts'
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

/** The live sections of the club among `ids`, by id (an internal booking's section, #123). */
export function findSections(
  container: AwilixContainer,
  scope: FacilitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, SectionDirectoryEntry>> {
  return directory(container).findSections(scope, ids, em)
}

/** The live active sections of the club, by name (the section options of the booking dialog, #123). */
export function listSections(container: AwilixContainer, scope: FacilitiesScope): Promise<SectionDirectoryEntry[]> {
  return directory(container).listSections(scope, null)
}

/** The live active places of the club, by name (the place cards of `/club/places`, #123). */
export function placeOptions(container: AwilixContainer, scope: FacilitiesScope): Promise<PlaceOption[]> {
  return directory(container).placeOptions(scope)
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

/**
 * The club's time zone. The club settings reads here take the caller's `em` inside a write transaction, so they read
 * on its connection instead of waiting for a second pooled one (#549, #836).
 */
export async function clubTimeZone(
  container: AwilixContainer,
  scope: FacilitiesScope,
  em?: EntityManager,
): Promise<string> {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  return (await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope, em)).values.timezone
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

/** The times of the done sessions on the places in the window (the hours of use of a maintenance task, #128). */
export function doneSessionTimes(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
  em?: EntityManager,
): Promise<Array<{ start: Date; end: Date }>> {
  return placeSessions(container).doneSessionTimes(scope, placeIds, window, em)
}

/** The places and times of the planned and done sessions on the places in the window (the owner report, #127). */
export function clubSessionTimes(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
  em?: EntityManager,
): Promise<Array<{ placeId: string; start: Date; end: Date }>> {
  return placeSessions(container).clubSessionTimes(scope, placeIds, window, em)
}

/** The live places the club rents from their owners, with their descendants (the rented-hours report, #129). */
export function rentedPlaces(
  container: AwilixContainer,
  scope: FacilitiesScope,
  em?: EntityManager,
): Promise<RentedPlace[]> {
  return directory(container).rentedPlaces(scope, em)
}

/** The done sessions on the places that start in the window, with group names and coach ids (rented hours, #129). */
export function doneSessionsForReport(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
  em?: EntityManager,
): Promise<DoneSessionReportEntry[]> {
  return placeSessions(container).doneSessionsForReport(scope, placeIds, window, em)
}

/** The live planned sessions among `ids` with their times and places (#123: a group event supersedes requests). */
export function sessionsByIds(
  container: AwilixContainer,
  scope: FacilitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<PlaceSessionEntry[]> {
  return placeSessions(container).sessionsByIds(scope, ids, em)
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

/** The live institutions of the club whose name contains `query`, by name: name and type only (DD-R07, #277). */
export function searchInstitutions(
  container: AwilixContainer,
  scope: FacilitiesScope,
  query: string,
  limit: number,
): Promise<InstitutionSearchEntry[]> {
  return directory(container).searchInstitutions(scope, query, limit)
}

/**
 * The live persons of the club whose first or last name matches every word of `query` (words of three characters or
 * more, through the people register's search index), by name, at most `limit`: the renter search of a caller with
 * `people.view` (DD-R07, #277). Empty when no word is long enough for the index.
 */
export async function searchPersons(
  container: AwilixContainer,
  scope: FacilitiesScope,
  query: string,
  limit: number,
): Promise<Array<{ id: string; name: string }>> {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  const people = container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY)
  const ids = await people.searchPersonIds(scope, query)
  if (!ids || ids.size === 0) return []
  const found = await people.findPersons(scope, [...ids])
  return [...found.values()]
    .map((entry) => ({ id: entry.id, name: `${entry.firstName} ${entry.lastName}`.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, limit)
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

/** The owner institution a rental of the place is paid to, with its account (the approval e-mail, #125). */
export function placePayee(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeId: string,
  em?: EntityManager,
): Promise<PlacePayee | null> {
  return directory(container).placePayee(scope, placeId, em)
}

/**
 * The rental terms of the management agreement with the owner institution in force on `on` (facilities parity spec
 * DD-R10; #284), or null when the club has none with that owner.
 */
export function facilityAgreement(
  container: AwilixContainer,
  scope: FacilitiesScope,
  institutionId: string,
  on: CalendarDate,
  em?: EntityManager,
): Promise<FacilityAgreement | null> {
  assertRegistered(container, CLUB_CORE_CONTRACTS)
  return container.resolve<ClubCoreContracts>(CLUB_CORE_CONTRACTS).facilityAgreement(scope, institutionId, on, em)
}

/**
 * The club values the request and renter e-mails need: the time zone, the currency, the default language, the own
 * account, and (#286) the public slug of the cancellation link, the club's rules and its phone.
 */
export async function clubRequestSettings(
  container: AwilixContainer,
  scope: FacilitiesScope,
  em?: EntityManager,
): Promise<{
  timeZone: string
  currency: string
  locale: string
  bankAccount: string | null
  publicSlug: string | null
  rulesUrl: string | null
  contactPhone: string | null
}> {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  const settings = await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope, em)
  return {
    timeZone: settings.values.timezone,
    currency: settings.values.currency,
    locale: settings.values.defaultLocale,
    bankAccount: settings.publicSettings.bankAccount,
    publicSlug: settings.publicSettings.publicSlug,
    rulesUrl: settings.publicSettings.rulesUrl,
    contactPhone: settings.publicSettings.contactPhone,
  }
}

/** The `auth` user id of every person among `ids` with an account, by person id (the maintenance reminders, #128). */
export function userIdsOf(
  container: AwilixContainer,
  scope: FacilitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, string>> {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY).findUserIds(scope, ids, em)
}

/** The person ids holding the club administrator role on `date` (the maintenance reminders, #128). */
export function clubAdminPersonIds(
  container: AwilixContainer,
  scope: FacilitiesScope,
  date: string,
  em?: EntityManager,
): Promise<string[]> {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY).roleHolderIdsOn(scope, 'club_admin', date, em)
}

/**
 * The person ids coordinating each section on each day among `pairs`, by `<sectionId>:<date>`, in one read (the
 * reschedule notices of the sessions, #287, #394).
 */
export function sectionCoordinatorIdsOnDays(
  container: AwilixContainer,
  scope: FacilitiesScope,
  pairs: ReadonlyArray<{ sectionId: string; date: CalendarDate }>,
  em?: EntityManager,
): Promise<Map<string, string[]>> {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY).sectionCoordinatorIdsOnDays(scope, pairs, em)
}

/** The user ids of the club's administrators on `date` (the request approvers, #125); persons without an account skipped. */
export async function clubAdminUserIds(
  container: AwilixContainer,
  scope: FacilitiesScope,
  date: string,
  em?: EntityManager,
): Promise<string[]> {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  const people = container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY)
  const personIds = await people.roleHolderIdsOn(scope, 'club_admin', date, em)
  const users = await people.findUserIds(scope, personIds, em)
  return [...new Set(users.values())]
}
