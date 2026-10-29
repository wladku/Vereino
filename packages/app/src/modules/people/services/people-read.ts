// Reads behind the hand-written detail routes of `people`: one record of the trusted tenant and organization,
// decrypted. The record scope is checked by the route with `assertInScope` on the returned row.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { consentsView, parseStoredConsents, type ConsentsView } from '../lib/people-rules'
import type { ClubScope } from './club-clock'

export async function findPerson(container: AwilixContainer, scope: ClubScope, id: string): Promise<Person | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return findOneWithDecryption(em, Person, { id, ...scope, deletedAt: null }, {}, scope)
}

export async function findRoleAssignment(
  container: AwilixContainer,
  scope: ClubScope,
  id: string,
): Promise<RoleAssignment | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return em.findOne(RoleAssignment, { id, ...scope, deletedAt: null })
}

export async function findGuardianship(
  container: AwilixContainer,
  scope: ClubScope,
  id: string,
): Promise<Guardianship | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return em.findOne(Guardianship, { id, ...scope, deletedAt: null })
}

/** The consents of the given guardianships of the organization, by id (the list adds them where they are visible). */
export async function findGuardianshipConsents(
  container: AwilixContainer,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Map<string, ConsentsView>> {
  if (ids.length === 0) return new Map()
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await em.find(
    Guardianship,
    { id: { $in: [...ids] }, ...scope, deletedAt: null },
    { fields: ['id', 'consents'] },
  )
  return new Map(rows.map((row) => [row.id, consentsView(parseStoredConsents(row.consents))]))
}
