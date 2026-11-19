// Reads behind the hand-written detail routes of `people`: one record of the trusted tenant and organization,
// decrypted. The record scope is checked by the route with `assertInScope` on the returned row.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { consentAuthorIds, withConsentAuthors, type MemberConsentsView } from '../lib/member-rules'
import { consentsView, holdsOwnConsents, parseStoredConsents, type ConsentsView } from '../lib/people-rules'
import { clubToday, type ClubScope } from './club-clock'

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

/**
 * An adult participant's own consents as the club administrator reads them on B-10 (people life-cycle spec REQ-L10,
 * #309): every author by name (the administrator reads every person of the club), and whether the person holds own
 * consents today (18 or more with a known birth date). Only for a caller with `people.manage`.
 */
export async function ownConsentsForStaff(
  container: AwilixContainer,
  scope: ClubScope,
  person: Person,
): Promise<{ holdsOwnConsents: boolean; consents: MemberConsentsView }> {
  const view = consentsView(parseStoredConsents(person.consents))
  const authorIds = consentAuthorIds([view])
  const em = container.resolve<EntityManager>('em').fork()
  const authors =
    authorIds.length > 0
      ? await findWithDecryption(
          em,
          Person,
          { id: { $in: authorIds }, ...scope },
          { fields: ['id', 'firstName', 'lastName'] },
          scope,
        )
      : []
  const names = new Map(authors.map((author) => [author.id, `${author.firstName} ${author.lastName}`.trim()]))
  return {
    holdsOwnConsents: holdsOwnConsents(person.birthDate, await clubToday(container, scope)),
    consents: withConsentAuthors(view, { family: new Set(authorIds), names, roles: new Map() }),
  }
}
