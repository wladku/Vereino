// The records of the modules `payments` requires (payments spec *Architecture*: `payments` → `activities`, `groups`,
// `people`, `club_core`), read through their DI services, never through their entities: groups and rosters
// (`groups.directory`), activities and sessions (`activities.scheduleDirectory`), persons and primary payers
// (`people.personDirectory`) and the club's day (`clubCoreSettings`). Every required module is enabled with
// `payments`, so a missing registration is a deployment error and fails closed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone, type CalendarDate } from '@vereino/core'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import type {
  ActivitiesScheduleDirectory,
  ScheduleActivityEntry,
  ScheduleOccurrenceEntry,
} from '../../activities/services/schedule-directory'
import type { GroupDirectory, GroupDirectoryEntry, RosterEntry } from '../../groups/services/group-directory'
import type { PersonDirectory, PersonDirectoryEntry } from '../../people/services/person-directory'

/** Tokens of the required modules' services (`activities/di.ts`, `groups/di.ts`, `people/di.ts`, `club_core/di.ts`). */
const ACTIVITIES_SCHEDULE_DIRECTORY = 'activities.scheduleDirectory'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'
const GROUPS_DIRECTORY = 'groups.directory'
const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'

export type PaymentsScope = { tenantId: string; organizationId: string }

function assertRegistered(container: AwilixContainer, token: string): void {
  if (!container.hasRegistration(token)) throw new Error('[internal] payments requires the DI service ' + token)
}

function groupDirectory(container: AwilixContainer): GroupDirectory {
  assertRegistered(container, GROUPS_DIRECTORY)
  return container.resolve<GroupDirectory>(GROUPS_DIRECTORY)
}

function scheduleDirectory(container: AwilixContainer): ActivitiesScheduleDirectory {
  assertRegistered(container, ACTIVITIES_SCHEDULE_DIRECTORY)
  return container.resolve<ActivitiesScheduleDirectory>(ACTIVITIES_SCHEDULE_DIRECTORY)
}

function personDirectory(container: AwilixContainer): PersonDirectory {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY)
}

function settingsService(container: AwilixContainer): ClubCoreSettingsService {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  return container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS)
}

export function findGroups(
  container: AwilixContainer,
  scope: PaymentsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, GroupDirectoryEntry>> {
  return groupDirectory(container).findGroups(scope, ids, em)
}

export function rosterOn(
  container: AwilixContainer,
  scope: PaymentsScope,
  groupId: string,
  date: CalendarDate,
  em?: EntityManager,
): Promise<RosterEntry[]> {
  return groupDirectory(container).rosterOn(scope, groupId, date, em)
}

export function findActivities(
  container: AwilixContainer,
  scope: PaymentsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, ScheduleActivityEntry>> {
  return scheduleDirectory(container).findActivities(scope, ids, em)
}

/** The live sessions of the given groups that start inside the window (at most 500, by start). */
export function listOccurrences(
  container: AwilixContainer,
  scope: PaymentsScope,
  groupIds: readonly string[],
  window: { from: Date; to: Date },
  em?: EntityManager,
): Promise<ScheduleOccurrenceEntry[]> {
  if (groupIds.length === 0) return Promise.resolve([])
  return scheduleDirectory(container).listOccurrences(scope, { groupIds }, window, em)
}

export function findPersons(
  container: AwilixContainer,
  scope: PaymentsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, PersonDirectoryEntry>> {
  return personDirectory(container).findPersons(scope, ids, em)
}

export function primaryPayers(
  container: AwilixContainer,
  scope: PaymentsScope,
  wardIds: readonly string[],
  date: CalendarDate,
  em?: EntityManager,
): Promise<Map<string, string>> {
  return personDirectory(container).primaryPayers(scope, wardIds, date, em)
}

/** The club's settings zone and today's date in it. */
export async function clubClock(
  container: AwilixContainer,
  scope: PaymentsScope,
  now: Date = new Date(),
): Promise<{ today: CalendarDate; timeZone: string }> {
  const settings = await settingsService(container).get(scope)
  const timeZone = settings.values.timezone
  return { today: calendarDateInZone(now, timeZone), timeZone }
}
