// The guards of the account commands (people life-cycle spec phase L1, REQ-L02, *Blocked account*; #303): the club's
// last active administrator cannot be blocked or closed (422 `last_club_admin`), and an account is closed only when
// the person holds no active role, guardianship or membership (409 `account_has_purpose`). Both read with the
// command's EntityManager, inside its transaction and under the person's row lock.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Validity, type CalendarDate } from '@vereino/core'
import { accountView } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { membershipContribution } from './membership-contribution'

type ClubScope = { tenantId: string; organizationId: string }

function activeOn(row: { validFrom: string; validTo?: string | null }, today: CalendarDate): boolean {
  return Validity.isActiveAt({ validFrom: row.validFrom, validTo: row.validTo ?? null }, today)
}

/**
 * 422 `last_club_admin` when `personId` holds an active `club_admin` role and no other person of the club with an
 * active `club_admin` role has an `active` account (signed in and not blocked).
 */
export async function assertNotLastClubAdmin(
  em: EntityManager,
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
  today: CalendarDate,
): Promise<void> {
  const where = { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null }
  const admins = await em.find(
    RoleAssignment,
    { ...where, role: 'club_admin' },
    { fields: ['id', 'personId', 'validFrom', 'validTo'] },
  )
  const activeAdminIds = new Set(admins.filter((row) => activeOn(row, today)).map((row) => row.personId))
  if (!activeAdminIds.has(personId)) return
  activeAdminIds.delete(personId)
  if (activeAdminIds.size === 0) return peopleErrors.throw('last_club_admin')
  const others = await em.find(
    Person,
    { ...where, id: { $in: [...activeAdminIds] }, userId: { $ne: null } },
    { fields: ['id', 'userId'] },
  )
  for (const other of others) {
    const account = await accountView(container, scope, other.userId, em)
    if (account.state === 'active') return
  }
  return peopleErrors.throw('last_club_admin')
}

/** 409 `account_has_purpose` while the person holds an active role, guardianship (either side) or membership. */
export async function assertAccountWithoutPurpose(
  em: EntityManager,
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
  today: CalendarDate,
): Promise<void> {
  const where = { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null }
  const roles = await em.find(RoleAssignment, { ...where, personId }, { fields: ['id', 'validFrom', 'validTo'] })
  const guardianships = await em.find(
    Guardianship,
    { ...where, $or: [{ guardianPersonId: personId }, { wardPersonId: personId }] },
    { fields: ['id', 'validFrom', 'validTo'] },
  )
  if ([...roles, ...guardianships].some((row) => activeOn(row, today))) {
    return peopleErrors.throw('account_has_purpose')
  }
  const contribution = membershipContribution(container)
  if (!contribution) return
  const subject = { ...scope, personId }
  // One query at a time: `em` is the command's transaction, a single connection.
  if (await contribution.isActiveParticipant(em, subject, today)) return peopleErrors.throw('account_has_purpose')
  const coached = await contribution.coachedGroupIds(em, subject, today)
  if (coached.length > 0) return peopleErrors.throw('account_has_purpose')
}
