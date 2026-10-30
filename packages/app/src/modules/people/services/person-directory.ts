// `people.personDirectory` (club spec *Architecture* → modules that require `people` reach it through DI, never through
// its entities): the names of persons of one organization, decrypted, for a consumer that has already authorized the
// rows that carry the person ids (the `groups` roster), and the existence check a consumer runs before it stores a
// person id. It returns no contact data, notes or PESEL; the account link (`findUserIds`) and the active guardians
// (`activeGuardians`) serve a consumer that notifies the people a record concerns (a cancelled session, #31).
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { CalendarDate } from '@vereino/core'
import { Guardianship, Person } from '../data/entities'
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
  /** The `auth` user id of every live person among `ids` that has an account, by person id. */
  findUserIds(scope: ClubScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, string>>
  /** The guardians of each ward among `wardIds` whose guardianship is active on `today`, by ward id. */
  activeGuardians(
    scope: ClubScope,
    wardIds: readonly string[],
    today: CalendarDate,
    em?: EntityManager,
  ): Promise<Map<string, string[]>>
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

export async function findUserIds(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Person,
    { id: { $in: unique }, ...scope, deletedAt: null, userId: { $ne: null } },
    { fields: ['id', 'userId'] },
  )
  return new Map(rows.flatMap((row) => (row.userId ? [[row.id, row.userId] as const] : [])))
}

export async function activeGuardians(
  em: EntityManager,
  scope: ClubScope,
  wardIds: readonly string[],
  today: CalendarDate,
): Promise<Map<string, string[]>> {
  const unique = [...new Set(wardIds)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Guardianship,
    {
      ...scope,
      wardPersonId: { $in: unique },
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['id', 'wardPersonId', 'guardianPersonId'] },
  )
  const byWard = new Map<string, string[]>()
  for (const row of rows) byWard.set(row.wardPersonId, [...(byWard.get(row.wardPersonId) ?? []), row.guardianPersonId])
  return byWard
}

export function createPersonDirectory(getEm: () => EntityManager): PersonDirectory {
  return {
    findPersons: (scope, ids, em) => findPersons(em ?? getEm().fork(), scope, ids),
    findUserIds: (scope, ids, em) => findUserIds(em ?? getEm().fork(), scope, ids),
    activeGuardians: (scope, wardIds, today, em) => activeGuardians(em ?? getEm().fork(), scope, wardIds, today),
  }
}
