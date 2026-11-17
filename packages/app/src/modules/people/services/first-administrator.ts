// The first club administrator (people life-cycle spec REQ-L13, J-L08 step 1; #305): whether the club already has an
// administrator and who it is, and whether a platform user belongs to the organization. Read in the trusted tenant
// and organization only; `POST /api/people/first-administrator` and `people.persons.bootstrap_admin` use them.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isActiveAt } from '@vereino/core'
import { Person, RoleAssignment } from '../data/entities'
import { clubToday } from './club-clock'

export type FirstAdministratorScope = { tenantId: string; organizationId: string }

export type ClubAdministrator = { personId: string; name: string }

/** The first person of the organization with a `club_admin` assignment active on `today`, or null. */
export async function activeClubAdministrator(
  em: EntityManager,
  scope: FirstAdministratorScope,
  today: string,
): Promise<ClubAdministrator | null> {
  const assignments = await em.find(
    RoleAssignment,
    { ...scope, role: 'club_admin', deletedAt: null },
    { orderBy: { validFrom: 'asc', id: 'asc' } },
  )
  const active = assignments.find((row) =>
    isActiveAt({ validFrom: row.validFrom, validTo: row.validTo ?? null }, today),
  )
  if (!active) return null
  const person = await findOneWithDecryption(em, Person, { ...scope, id: active.personId, deletedAt: null }, {}, scope)
  if (!person) return null
  return { personId: person.id, name: [person.firstName, person.lastName].filter(Boolean).join(' ') }
}

/** Whether `userId` is a live platform user of exactly this tenant and organization. */
export async function isOrganizationUser(
  em: EntityManager,
  scope: FirstAdministratorScope,
  userId: string,
): Promise<boolean> {
  const user = await em.findOne(
    User,
    { id: userId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
    { fields: ['id'] },
  )
  return user !== null
}

/** The club's administrator on the club's today, or null: `GET /api/people/first-administrator` and its banner. */
export async function currentClubAdministrator(
  container: AwilixContainer,
  scope: FirstAdministratorScope,
): Promise<ClubAdministrator | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return activeClubAdministrator(em, scope, await clubToday(container, scope))
}
