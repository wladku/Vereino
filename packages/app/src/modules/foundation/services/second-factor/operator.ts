// Operator steps of the staff second factor (spec *Rollout*, DD-2F07; #736), run from the shell only, never from a
// request; the arguments name the tenant and organization and every query stays in them.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Session, User } from '@open-mercato/core/modules/auth/data/entities'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { holdsSecondFactorRequirement } from './requirement'

export type OperatorScope = { tenantId: string; organizationId: string }

/** The live user of `email` in the named club, or null. */
export async function findClubUserByEmail(
  container: AwilixContainer,
  scope: OperatorScope,
  email: string,
): Promise<User | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const wanted = email.trim().toLowerCase()
  const users = await findWithDecryption(em, User, { ...scope, deletedAt: null }, {}, scope)
  return users.find((user) => user.email.trim().toLowerCase() === wanted) ?? null
}

/**
 * Ends the sessions of every user of the club who holds the requirement (Q-2F05: right after the ACL sync of the
 * release). Answers the counts; a repeat finds no session.
 */
export async function endRequiredUsersSessions(
  container: AwilixContainer,
  scope: OperatorScope,
): Promise<{ users: number; required: number; sessionsEnded: number }> {
  const em = container.resolve<EntityManager>('em').fork()
  const users = await findWithDecryption(em, User, { ...scope, deletedAt: null }, {}, scope)
  let required = 0
  let sessionsEnded = 0
  for (const user of users) {
    if (!(await holdsSecondFactorRequirement(container, user.id, scope))) continue
    required += 1
    sessionsEnded += await em.nativeDelete(Session, { user: user.id })
  }
  return { users: users.length, required, sessionsEnded }
}
