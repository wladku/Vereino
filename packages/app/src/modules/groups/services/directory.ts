// The records of the modules `groups` requires (club spec *Architecture*: `groups` → `people` → `club_core`), read
// through their DI services, never through their entities: a group's section (`clubCoreDirectory`), an external
// team's institution (`clubCoreDirectory`) and the persons of a roster (`people.personDirectory`). Both modules are
// required, so a missing registration is a deployment error and fails closed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type {
  ClubCoreDirectory,
  InstitutionDirectoryEntry,
  SectionDirectoryEntry,
} from '../../club_core/services/directory'
import type { PersonDirectory, PersonDirectoryEntry } from '../../people/services/person-directory'

/** `club_core`'s directory token (`CLUB_CORE_DIRECTORY` in `club_core/di.ts`). */
const CLUB_CORE_DIRECTORY = 'clubCoreDirectory'
/** `people`'s person directory token (`PEOPLE_PERSON_DIRECTORY` in `people/di.ts`). */
const PEOPLE_PERSON_DIRECTORY = 'people.personDirectory'

export type GroupsScope = { tenantId: string; organizationId: string }

function assertRegistered(container: AwilixContainer, token: string): void {
  if (!container.hasRegistration(token)) {
    throw new Error('[internal] groups requires the DI service ' + token)
  }
}

function clubCoreDirectory(container: AwilixContainer): ClubCoreDirectory {
  assertRegistered(container, CLUB_CORE_DIRECTORY)
  return container.resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
}

function personDirectory(container: AwilixContainer): PersonDirectory {
  assertRegistered(container, PEOPLE_PERSON_DIRECTORY)
  return container.resolve<PersonDirectory>(PEOPLE_PERSON_DIRECTORY)
}

export function findSections(
  container: AwilixContainer,
  scope: GroupsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, SectionDirectoryEntry>> {
  return clubCoreDirectory(container).findSections(scope, ids, em)
}

export function findInstitutions(
  container: AwilixContainer,
  scope: GroupsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, InstitutionDirectoryEntry>> {
  return clubCoreDirectory(container).findInstitutions(scope, ids, em)
}

export function findPersons(
  container: AwilixContainer,
  scope: GroupsScope,
  ids: readonly string[],
  em?: EntityManager,
): Promise<Map<string, PersonDirectoryEntry>> {
  return personDirectory(container).findPersons(scope, ids, em)
}
