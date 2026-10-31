// What the club already holds for a bulk import (club spec DD-38, Q-044; #28): the persons whose PESEL or import
// identifier appears in the file — found through the deterministic lookup hashes, never by name — plus the persons a
// `match` decision names, each with its active guardians and wards (decrypted names), so `planImport` can match a
// relative without an identifier through a matched person of the same row.
import type { FilterQuery } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isActiveAt, type CalendarDate } from '@vereino/core'
import { Guardianship, Person } from '../data/entities'
import { personExternalId, personPesel } from '../encryption'
import {
  identityKeys,
  type ExistingDirectory,
  type ExistingPerson,
  type ExistingRelative,
  type NormalizedImportRow,
} from '../lib/import-rules'

type ClubScope = { tenantId: string; organizationId: string }

/** Hash → identity key for every PESEL and import identifier of the rows. */
function hashKeys(rows: readonly NormalizedImportRow[]) {
  const pesel = new Map<string, string>()
  const external = new Map<string, string>()
  for (const row of rows) {
    for (const values of Object.values(row.persons)) {
      for (const key of identityKeys(values)) {
        if (key.startsWith('pesel:')) {
          for (const hash of personPesel.lookup(key.slice('pesel:'.length))) pesel.set(hash, key)
        } else {
          for (const hash of personExternalId.lookup(key.slice('ext:'.length))) external.set(hash, key)
        }
      }
    }
  }
  return { pesel, external }
}

const toRelative = (person: Person | undefined, personId: string, isPrimaryPayer: boolean): ExistingRelative => ({
  personId,
  firstName: person?.firstName ?? '',
  lastName: person?.lastName ?? '',
  isPrimaryPayer,
})

export async function loadImportDirectory(
  em: EntityManager,
  scope: ClubScope,
  rows: readonly NormalizedImportRow[],
  matchPersonIds: readonly string[],
  today: CalendarDate,
): Promise<ExistingDirectory> {
  const decryption = { tenantId: scope.tenantId, organizationId: scope.organizationId }
  const { pesel, external } = hashKeys(rows)
  const or: FilterQuery<Person>[] = []
  if (pesel.size > 0) or.push({ peselHash: { $in: [...pesel.keys()] } })
  if (external.size > 0) or.push({ externalIdHash: { $in: [...external.keys()] } })
  if (matchPersonIds.length > 0) or.push({ id: { $in: [...new Set(matchPersonIds)] } })
  const byIdentity = new Map<string, string>()
  const persons = new Map<string, ExistingPerson>()
  if (or.length === 0) return { byIdentity, persons }

  const where: FilterQuery<Person> = { ...scope, deletedAt: null, $or: or }
  const found: Person[] = await findWithDecryption(em, Person, where, undefined, decryption)
  for (const person of found) {
    const peselKey = person.peselHash ? pesel.get(person.peselHash) : undefined
    const externalKey = person.externalIdHash ? external.get(person.externalIdHash) : undefined
    if (peselKey) byIdentity.set(peselKey, person.id)
    if (externalKey) byIdentity.set(externalKey, person.id)
  }
  const ids = found.map((person) => person.id)
  const links =
    ids.length === 0
      ? []
      : await em.find(Guardianship, {
          ...scope,
          deletedAt: null,
          $or: [{ wardPersonId: { $in: ids } }, { guardianPersonId: { $in: ids } }],
        })
  const active = links.filter((link) => isActiveAt({ validFrom: link.validFrom, validTo: link.validTo ?? null }, today))
  const relativeIds = [...new Set(active.flatMap((link) => [link.wardPersonId, link.guardianPersonId]))]
  const relatives =
    relativeIds.length === 0
      ? []
      : await findWithDecryption(
          em,
          Person,
          { ...scope, deletedAt: null, id: { $in: relativeIds } },
          undefined,
          decryption,
        )
  const byId = new Map(relatives.map((person) => [person.id, person]))
  for (const person of found) {
    persons.set(person.id, {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      birthDate: person.birthDate ?? null,
      email: person.email ?? null,
      phone: person.phone ?? null,
      hasPesel: Boolean(person.pesel),
      hasExternalId: Boolean(person.externalId),
      updatedAt: person.updatedAt.toISOString(),
      guardians: active
        .filter((link) => link.wardPersonId === person.id && byId.has(link.guardianPersonId))
        .map((link) => toRelative(byId.get(link.guardianPersonId), link.guardianPersonId, link.isPrimaryPayer)),
      wards: active
        .filter((link) => link.guardianPersonId === person.id && byId.has(link.wardPersonId))
        .map((link) => toRelative(byId.get(link.wardPersonId), link.wardPersonId, link.isPrimaryPayer)),
    })
  }
  return { byIdentity, persons }
}
