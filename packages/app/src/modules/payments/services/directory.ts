// The records of the modules `payments` requires (payments spec *Architecture*: `payments` → `activities`, `groups`,
// `people`, `club_core`), read through their DI services, never through their entities: groups and rosters
// (`groups.directory`), activities and sessions (`activities.scheduleDirectory`), persons and primary payers
// (`people.personDirectory`) and the club's day (`clubCoreSettings`). Every required module is enabled with
// `payments`, so a missing registration is a deployment error and fails closed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone, type CalendarDate } from '@vereino/core'
import type { ClubCoreDirectory, SectionDirectoryEntry } from '../../club_core/services/directory'
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
const CLUB_CORE_DIRECTORY = 'clubCoreDirectory'
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

function clubDirectory(container: AwilixContainer): ClubCoreDirectory {
  assertRegistered(container, CLUB_CORE_DIRECTORY)
  return container.resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
}

/** The live sections of the club among `ids` (an order campaign's section, #115). */
export function findSections(
  container: AwilixContainer,
  scope: PaymentsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, SectionDirectoryEntry>> {
  return clubDirectory(container).findSections(scope, ids, em)
}

export function findGroups(
  container: AwilixContainer,
  scope: PaymentsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, GroupDirectoryEntry>> {
  return groupDirectory(container).findGroups(scope, ids, em)
}

/**
 * The live active groups by name: all of them (`filter` null) or those in `sectionIds` or among `groupIds` — the
 * groups of "My groups' payments" (#117), the filter derived from the caller's grants.
 */
export function listGroups(
  container: AwilixContainer,
  scope: PaymentsScope,
  filter: { sectionIds?: readonly string[]; groupIds?: readonly string[] } | null,
  em?: EntityManager,
): Promise<GroupDirectoryEntry[]> {
  return groupDirectory(container).listGroups(scope, filter, em)
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

/** The public, active groups of the sections (`groups` alone decides what a public group is; #112). */
export function publicGroups(
  container: AwilixContainer,
  scope: PaymentsScope,
  sectionIds: readonly string[],
  em?: EntityManager,
): Promise<GroupDirectoryEntry[]> {
  return groupDirectory(container).publicGroups(scope, sectionIds, em)
}

export function findActivities(
  container: AwilixContainer,
  scope: PaymentsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, ScheduleActivityEntry>> {
  return scheduleDirectory(container).findActivities(scope, ids, em)
}

/** The page size of `activities.scheduleDirectory.listOccurrences`: it returns at most this many sessions, by start. */
export const SCHEDULE_PAGE = 500

/**
 * Every live session of the given groups that starts inside the window. Read per group and paged past the schedule
 * directory's cap, so a per-session fee is never billed for fewer sessions than were held.
 */
export async function listOccurrences(
  container: AwilixContainer,
  scope: PaymentsScope,
  groupIds: readonly string[],
  window: { from: Date; to: Date },
  em?: EntityManager,
): Promise<ScheduleOccurrenceEntry[]> {
  const directory = scheduleDirectory(container)
  const sessions = new Map<string, ScheduleOccurrenceEntry>()
  for (const groupId of new Set(groupIds)) {
    let from = window.from
    for (;;) {
      const page = await directory.listOccurrences(scope, { groupIds: [groupId] }, { from, to: window.to }, em)
      for (const session of page) sessions.set(session.id, session)
      if (page.length < SCHEDULE_PAGE) break
      const last = page[page.length - 1].startAt
      // A full page of sessions starting at one instant cannot be paged by start; refuse rather than undercount.
      if (last.getTime() === from.getTime()) {
        throw new Error('[internal] payments cannot page the sessions of group ' + groupId)
      }
      from = last
    }
  }
  return [...sessions.values()]
}

export function findPersons(
  container: AwilixContainer,
  scope: PaymentsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, PersonDirectoryEntry>> {
  return personDirectory(container).findPersons(scope, ids, em)
}

/** The persons whose name matches every word of `term` (three letters or more), or null when none is long enough. */
export function searchPersonIds(
  container: AwilixContainer,
  scope: PaymentsScope,
  term: string,
): Promise<Set<string> | null> {
  return personDirectory(container).searchPersonIds(scope, term)
}

/** The guardians of each ward whose guardianship is active on `date` (the order reminder, #115). */
export function activeGuardians(
  container: AwilixContainer,
  scope: PaymentsScope,
  wardIds: readonly string[],
  date: CalendarDate,
  em?: EntityManager,
): Promise<Map<string, string[]>> {
  return personDirectory(container).activeGuardians(scope, wardIds, date, em)
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
