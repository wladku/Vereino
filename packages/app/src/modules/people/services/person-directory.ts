// `people.personDirectory` (club spec *Architecture* → modules that require `people` reach it through DI, never through
// its entities): the names of persons of one organization, decrypted, for a consumer that has already authorized the
// rows that carry the person ids (the `groups` roster), and the existence check a consumer runs before it stores a
// person id. It returns no contact data, notes, PESEL or account.
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Person } from '../data/entities'
import type { ClubScope } from './club-clock'

/** The display data of a person a consumer may show next to the record it authorized. */
export type PersonDirectoryEntry = {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
}

export type PersonDirectory = {
  /**
   * The live persons of the organization among `ids`, by id; unknown or deleted ids are absent. `em` is the caller's
   * EntityManager when the read must run in its transaction.
   */
  findPersons(scope: ClubScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, PersonDirectoryEntry>>
}

export async function findPersons(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Map<string, PersonDirectoryEntry>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await findWithDecryption(
    em,
    Person,
    { id: { $in: unique }, ...scope, deletedAt: null },
    { fields: ['id', 'firstName', 'lastName', 'birthDate'] },
    scope,
  )
  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate ?? null },
    ]),
  )
}

export function createPersonDirectory(getEm: () => EntityManager): PersonDirectory {
  return {
    findPersons: (scope, ids, em) => findPersons(em ?? getEm().fork(), scope, ids),
  }
}
