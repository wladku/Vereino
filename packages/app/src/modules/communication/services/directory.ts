// The records of other modules `communication` reads, through their DI services, never through their entities (club
// spec *Architecture*): sections (`clubCoreDirectory`), groups (`groups.directory`), persons and guardians
// (`people.personDirectory`), the club's settings (`clubCoreSettings`) and — optionally, read with `hasRegistration`
// — activities and sessions (`activities.scheduleDirectory`) and the share text (`activities.shareText`). `people`,
// `groups` and `club_core` are required modules, so a missing registration of theirs is a deployment error.
import type { AwilixContainer } from 'awilix'
import type { CalendarDate } from '@vereino/core'
import type { ActivitiesScheduleDirectory } from '../../activities/services/schedule-directory'
import type { ActivitiesShareText } from '../../activities/services/share-text'
import type { ClubCoreDirectory } from '../../club_core/services/directory'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import type { GroupDirectory } from '../../groups/services/group-directory'
import type { PersonDirectory, PersonDirectoryEntry } from '../../people/services/person-directory'

const CLUB_CORE_DIRECTORY = 'clubCoreDirectory'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'
const GROUPS_DIRECTORY = 'groups.directory'
const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'
const ACTIVITIES_SCHEDULE_DIRECTORY = 'activities.scheduleDirectory'
const ACTIVITIES_SHARE_TEXT = 'activities.shareText'

export type CommunicationScope = { tenantId: string; organizationId: string }

function assertRegistered(container: AwilixContainer, token: string): void {
  if (!container.hasRegistration(token)) throw new Error('[internal] communication requires the DI service ' + token)
}

export function clubCoreDirectory(container: AwilixContainer): ClubCoreDirectory {
  assertRegistered(container, CLUB_CORE_DIRECTORY)
  return container.resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
}

export function groupDirectory(container: AwilixContainer): GroupDirectory {
  assertRegistered(container, GROUPS_DIRECTORY)
  return container.resolve<GroupDirectory>(GROUPS_DIRECTORY)
}

export function personDirectory(container: AwilixContainer): PersonDirectory {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY)
}

/** `activities.scheduleDirectory`, or null when `activities` is not enabled (activity and session kinds unavailable). */
export function scheduleDirectory(container: AwilixContainer): ActivitiesScheduleDirectory | null {
  return container.hasRegistration(ACTIVITIES_SCHEDULE_DIRECTORY)
    ? container.resolve<ActivitiesScheduleDirectory>(ACTIVITIES_SCHEDULE_DIRECTORY)
    : null
}

/** `activities.shareText`, or null when `activities` is not enabled (the session share text answers 404). */
export function shareTextService(container: AwilixContainer): ActivitiesShareText | null {
  return container.hasRegistration(ACTIVITIES_SHARE_TEXT)
    ? container.resolve<ActivitiesShareText>(ACTIVITIES_SHARE_TEXT)
    : null
}

/** The club's time zone and default language (club spec DD-37). */
export async function clubFacts(
  container: AwilixContainer,
  scope: CommunicationScope,
): Promise<{ timeZone: string; defaultLocale: string }> {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  const settings = await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope)
  return { timeZone: settings.values.timezone, defaultLocale: settings.values.defaultLocale }
}

export function findPersons(
  container: AwilixContainer,
  scope: CommunicationScope,
  ids: readonly string[],
): Promise<Map<string, PersonDirectoryEntry>> {
  return personDirectory(container).findPersons(scope, ids)
}

export function activeGuardians(
  container: AwilixContainer,
  scope: CommunicationScope,
  wardIds: readonly string[],
  today: CalendarDate,
): Promise<Map<string, string[]>> {
  return personDirectory(container).activeGuardians(scope, wardIds, today)
}

/** "First Last" of a directory entry. */
export function personName(entry: PersonDirectoryEntry | undefined): string | null {
  if (!entry) return null
  const name = `${entry.firstName} ${entry.lastName}`.trim()
  return name || null
}
