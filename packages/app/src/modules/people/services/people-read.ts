// Reads behind the hand-written detail routes of `people`: one record of the trusted tenant and organization,
// decrypted. The record scope is checked by the route with `assertInScope` on the returned row.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Person, RoleAssignment } from '../data/entities'
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
