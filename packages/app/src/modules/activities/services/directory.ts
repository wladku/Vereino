// The records of the modules `activities` requires (club spec *Architecture*: `activities` → `groups` → `people` →
// `club_core`), read through their DI services, never through their entities: groups, rosters and external teams
// (`groups.directory`), places and the place tree (`clubCoreDirectory`, `clubCorePlaces`), persons, their accounts
// and guardians (`people.personDirectory`), and the club's settings (`clubCoreSettings`). Every required module is
// enabled with `activities`, so a missing registration is a deployment error and fails closed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone, type CalendarDate } from '@vereino/core'
import type {
  ClubCoreDirectory,
  PlaceDirectoryEntry,
  PlaceFamily,
  SectionDirectoryEntry,
} from '../../club_core/services/directory'
import type { ClubCorePlacesService } from '../../club_core/services/places'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import type {
  ExternalTeamDirectoryEntry,
  GroupDirectory,
  GroupDirectoryEntry,
  MembershipPeriod,
  RosterEntry,
} from '../../groups/services/group-directory'
import type { PersonDirectory, PersonDirectoryEntry, SharedContact } from '../../people/services/person-directory'

/** Tokens of the required modules' services (`club_core/di.ts`, `groups/di.ts`, `people/di.ts`). */
const CLUB_CORE_DIRECTORY = 'clubCoreDirectory'
const CLUB_CORE_PLACES = 'clubCorePlaces'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'
const GROUPS_DIRECTORY = 'groups.directory'
const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'

export type ActivitiesScope = { tenantId: string; organizationId: string }

function assertRegistered(container: AwilixContainer, token: string): void {
  if (!container.hasRegistration(token)) throw new Error('[internal] activities requires the DI service ' + token)
}

function groupDirectory(container: AwilixContainer): GroupDirectory {
  assertRegistered(container, GROUPS_DIRECTORY)
  return container.resolve<GroupDirectory>(GROUPS_DIRECTORY)
}

function clubCoreDirectory(container: AwilixContainer): ClubCoreDirectory {
  assertRegistered(container, CLUB_CORE_DIRECTORY)
  return container.resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
}

function personDirectory(container: AwilixContainer): PersonDirectory {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY)
}

export function findGroups(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, GroupDirectoryEntry>> {
  return groupDirectory(container).findGroups(scope, ids, em)
}

export function rosterOn(
  container: AwilixContainer,
  scope: ActivitiesScope,
  groupId: string,
  date: CalendarDate,
  em?: EntityManager,
): Promise<RosterEntry[]> {
  return groupDirectory(container).rosterOn(scope, groupId, date, em)
}

export function findExternalTeams(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, ExternalTeamDirectoryEntry>> {
  return groupDirectory(container).findExternalTeams(scope, ids, em)
}

export function findPlaces(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, PlaceDirectoryEntry>> {
  return clubCoreDirectory(container).findPlaces(scope, ids, em)
}

export function findSections(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, SectionDirectoryEntry>> {
  return clubCoreDirectory(container).findSections(scope, ids, em)
}

export function placeFamily(
  container: AwilixContainer,
  scope: ActivitiesScope,
  placeId: string,
  em?: EntityManager,
): Promise<PlaceFamily | null> {
  return clubCoreDirectory(container).placeFamily(scope, placeId, em)
}

/** 404 for an unknown place, 422 `place_not_bookable` for a place with children (club spec glossary *Place*). */
export function assertBookablePlace(
  container: AwilixContainer,
  scope: ActivitiesScope,
  placeId: string,
  em?: EntityManager,
): Promise<void> {
  assertRegistered(container, CLUB_CORE_PLACES)
  return container.resolve<ClubCorePlacesService>(CLUB_CORE_PLACES).assertBookableLeaf(scope, placeId, em)
}

export function findPersons(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, PersonDirectoryEntry>> {
  return personDirectory(container).findPersons(scope, ids, em)
}

export function findUserIds(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, string>> {
  return personDirectory(container).findUserIds(scope, ids, em)
}

export function activeGuardians(
  container: AwilixContainer,
  scope: ActivitiesScope,
  wardIds: readonly string[],
  today: CalendarDate,
  em?: EntityManager,
): Promise<Map<string, string[]>> {
  return personDirectory(container).activeGuardians(scope, wardIds, today, em)
}

/** The participant memberships of persons overlapping a window of club-zone dates (the member calendar, #32). */
export function membershipsOf(
  container: AwilixContainer,
  scope: ActivitiesScope,
  personIds: readonly string[],
  window: { from: CalendarDate; to: CalendarDate },
  em?: EntityManager,
): Promise<MembershipPeriod[]> {
  return groupDirectory(container).membershipsOf(scope, personIds, window, em)
}

/** The persons among `ids` who consented to showing their wards' presence to other guardians (REQ-006, #32). */
export function presenceConsents(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Set<string>> {
  return personDirectory(container).presenceConsents(scope, ids, em)
}

/** The persons among `ids` who share their contacts with coaches and have an account (REQ-037, #34). Ids only. */
export function contactConsents(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
): Promise<Set<string>> {
  return personDirectory(container).contactConsents(scope, ids)
}

/** The consenting persons' names, phone and e-mail — only after the read was authorized and logged (#34). */
export function sharedContacts(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
): Promise<Map<string, SharedContact>> {
  return personDirectory(container).sharedContacts(scope, ids)
}

/** The club's time zone (club spec DD-37: `Europe/Warsaw` by default). */
export async function clubTimeZone(container: AwilixContainer, scope: ActivitiesScope): Promise<string> {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  return (await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope)).values.timezone
}

/** The club settings the declarations read (club spec REQ-006, REQ-007; D-022, D-026): the zone, the kinds, the visibility. */
export type AttendanceSettings = {
  timeZone: string
  /** `absence_only` or `confirm` per activity type (`declaration_kinds`). */
  declarationKinds: Record<string, 'absence_only' | 'confirm'>
  /** `none` or `consented` (`show_called_up_children`, R15). */
  showCalledUpChildren: 'none' | 'consented'
}

export async function attendanceSettings(
  container: AwilixContainer,
  scope: ActivitiesScope,
): Promise<AttendanceSettings> {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  const { values } = await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope)
  return {
    timeZone: values.timezone,
    declarationKinds: values.declarationKinds,
    showCalledUpChildren: values.showCalledUpChildren,
  }
}

/** The club's zone and today's date in it (S3.5: `now` is a parameter). */
export async function clubClock(
  container: AwilixContainer,
  scope: ActivitiesScope,
  now: Date = new Date(),
): Promise<{ timeZone: string; today: CalendarDate }> {
  const timeZone = await clubTimeZone(container, scope)
  return { timeZone, today: calendarDateInZone(now, timeZone) }
}
