// The records of other modules `training` reads, through their DI services, never their entities (training outlines
// spec DD-O07a): sessions and activities from the optional `activities.occurrenceFacts` (without `activities` there
// are no sessions to attach to, so every lookup answers empty), groups from `groups.directory` and persons from
// `people.personDirectory` (both required modules, so a missing registration fails closed).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { ActivityFact, OccurrenceFact, OccurrenceFactsContract } from '../../activities/services/occurrence-facts'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import type { GroupDirectory, GroupDirectoryEntry } from '../../groups/services/group-directory'
import type { PersonDirectory, PersonDirectoryEntry } from '../../people/services/person-directory'

export type { ActivityFact, OccurrenceFact }

export type TrainingScope = { tenantId: string; organizationId: string }

const OCCURRENCE_FACTS = 'activities.occurrenceFacts'
const GROUPS_DIRECTORY = 'groups.directory'
const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'

function assertRegistered(container: AwilixContainer, token: string): void {
  if (!container.hasRegistration(token)) throw new Error('[internal] training requires the DI service ' + token)
}

function occurrenceFacts(container: AwilixContainer): OccurrenceFactsContract | null {
  return container.hasRegistration(OCCURRENCE_FACTS)
    ? container.resolve<OccurrenceFactsContract>(OCCURRENCE_FACTS)
    : null
}

export async function findOccurrences(
  container: AwilixContainer,
  scope: TrainingScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, OccurrenceFact>> {
  const facts = occurrenceFacts(container)
  if (!facts || ids.length === 0) return new Map()
  return facts.occurrences(scope, ids, em)
}

export async function findOccurrence(
  container: AwilixContainer,
  scope: TrainingScope,
  id: string,
  em?: EntityManager,
): Promise<OccurrenceFact | null> {
  return (await findOccurrences(container, scope, [id], em)).get(id) ?? null
}

export async function findActivity(
  container: AwilixContainer,
  scope: TrainingScope,
  id: string,
  em?: EntityManager,
): Promise<ActivityFact | null> {
  const facts = occurrenceFacts(container)
  if (!facts) return null
  return (await facts.activities(scope, [id], em)).get(id) ?? null
}

export async function upcomingSessions(
  container: AwilixContainer,
  scope: TrainingScope,
  activityId: string,
  from: Date,
  em?: EntityManager,
): Promise<OccurrenceFact[]> {
  const facts = occurrenceFacts(container)
  if (!facts) return []
  return facts.upcomingSessions(scope, activityId, from, em)
}

export function findGroups(
  container: AwilixContainer,
  scope: TrainingScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, GroupDirectoryEntry>> {
  assertRegistered(container, GROUPS_DIRECTORY)
  return container.resolve<GroupDirectory>(GROUPS_DIRECTORY).findGroups(scope, ids, em)
}

export function findPersons(
  container: AwilixContainer,
  scope: TrainingScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, PersonDirectoryEntry>> {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY).findPersons(scope, ids, em)
}

/** The club's display name for the print header: the short name from the club settings, else the organization's. */
export async function clubName(container: AwilixContainer, scope: TrainingScope): Promise<string | null> {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  const settings = container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS)
  const { values } = await settings.get(scope)
  return values.shortName ?? (await settings.organizationName(scope))
}

/**
 * The persons who lead the group on `date`: a live `coach` or `assistant` membership (training outlines spec DD-O12:
 * every coach or assistant of the session's group records a use at close, so each of them may rate).
 */
export async function groupLeadersOn(
  container: AwilixContainer,
  scope: TrainingScope,
  groupId: string,
  date: string,
  em?: EntityManager,
): Promise<string[]> {
  assertRegistered(container, GROUPS_DIRECTORY)
  const roster = await container.resolve<GroupDirectory>(GROUPS_DIRECTORY).rosterOn(scope, groupId, date, em)
  return [...new Set(roster.filter((entry) => LEADER_ROLES.has(entry.role)).map((entry) => entry.personId))]
}

const LEADER_ROLES = new Set<string>(['coach', 'assistant'])

/** The public names ("First L.") of the persons who gave the name consent (DD-29); the others are absent. */
export function findPublicNames(
  container: AwilixContainer,
  scope: TrainingScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, string>> {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY).publicNames(scope, ids, em)
}

/** The club's widest outline library level (`ClubSettings.outlineLibraryMaxVisibility`, B-O1, BR-O4). */
export async function clubLibraryLevel(container: AwilixContainer, scope: TrainingScope): Promise<string> {
  assertRegistered(container, CLUB_CORE_SETTINGS)
  const { values } = await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope)
  return values.outlineLibraryMaxVisibility
}
