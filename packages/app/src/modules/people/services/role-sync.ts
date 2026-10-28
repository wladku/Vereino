// The `auth` role sync of `people` (foundation spec DD-F05, P-04, P-05; club spec TEST-005): a person's desired role
// set — the roles outside `vereino_*`, the roles of the active assignments, `vereino_member` for an account and
// `vereino_payer` for an adult guardian — written through the foundation's `syncAuthRoles`. Used by the
// `people:sync-auth-roles` subscriber and the `people.persons.sync_roles` job command; idempotent by set comparison.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CalendarDate } from '@vereino/core'
import { desiredRoles, jobCommandContext, syncAuthRoles, type RoleSyncResult } from '@/modules/foundation'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { isPayerEligible } from '../lib/people-rules'
import { clubToday, type ClubScope } from './club-clock'

export type PersonRoleSyncOutcome = RoleSyncResult | 'no_account' | 'person_missing'

type PersonForSync = Pick<Person, 'id' | 'userId' | 'birthDate'>

/** The desired `auth` roles of a person with an account, from `currentRoles` (kept outside `vereino_*`). */
export async function desiredRolesForPerson(
  em: EntityManager,
  person: PersonForSync,
  scope: ClubScope,
  today: CalendarDate,
): Promise<(currentRoles: readonly string[]) => string[]> {
  const where = { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null }
  const assignments = await em.find(
    RoleAssignment,
    { ...where, personId: person.id },
    { fields: ['id', 'role', 'validFrom', 'validTo'] },
  )
  const guardianships = await em.find(
    Guardianship,
    { ...where, guardianPersonId: person.id },
    { fields: ['id', 'validFrom', 'validTo'] },
  )
  const payerEligible = isPayerEligible(
    {
      birthDate: person.birthDate ?? null,
      guardianships: guardianships.map((row) => ({ validFrom: row.validFrom, validTo: row.validTo ?? null })),
    },
    today,
  )
  const periods = assignments.map((row) => ({ role: row.role, validFrom: row.validFrom, validTo: row.validTo ?? null }))
  return (currentRoles) => desiredRoles({ currentRoles, assignments: periods, hasAccount: true, payerEligible }, today)
}

/** Syncs one person's roles inside the caller's transaction (`em`). */
export async function syncPersonRolesInTransaction(
  em: EntityManager,
  person: PersonForSync,
  options: { scope: ClubScope; today: CalendarDate; commandContext: CommandRuntimeContext },
): Promise<PersonRoleSyncOutcome> {
  if (!person.userId) return 'no_account'
  const desired = await desiredRolesForPerson(em, person, options.scope, options.today)
  return syncAuthRoles(person.userId, desired, { commandContext: options.commandContext, em, scope: options.scope })
}

/**
 * Syncs one person's roles in its own transaction, as a system actor of the person's organization (subscriber
 * path). A failure propagates, so the persistent subscriber's queue retries it.
 */
export async function syncPersonRoles(
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
  today?: CalendarDate,
): Promise<PersonRoleSyncOutcome> {
  const em = container.resolve<EntityManager>('em').fork()
  const date = today ?? (await clubToday(container, scope))
  let outcome: PersonRoleSyncOutcome = 'person_missing'
  await withAtomicFlush(
    em,
    [
      async () => {
        const person = await em.findOne(
          Person,
          { id: personId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
          { fields: ['id', 'userId', 'birthDate'] },
        )
        if (!person) return
        outcome = await syncPersonRolesInTransaction(em, person, {
          scope,
          today: date,
          commandContext: jobCommandContext(container, scope),
        })
      },
    ],
    { transaction: true, label: 'people.role_sync' },
  )
  return outcome
}

/** The person a role assignment belongs to, also for a soft-deleted assignment (the `deleted` event). */
export async function personIdOfAssignment(
  container: AwilixContainer,
  scope: ClubScope,
  assignmentId: string,
): Promise<string | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const row = await em.findOne(
    RoleAssignment,
    { id: assignmentId, tenantId: scope.tenantId, organizationId: scope.organizationId },
    { fields: ['id', 'personId'] },
  )
  return row?.personId ?? null
}

export type RoleSyncCounts = { processed: number; updated: number; unchanged: number; failed: number; skipped: number }

/**
 * Recomputes the roles of every person with an account in the organization (the `people:sync-role-expiry` job):
 * one transaction per person, so one failing user does not block the others and is retried by the next run.
 */
export async function syncAllPersonRoles(
  container: AwilixContainer,
  scope: ClubScope,
  options: { today: CalendarDate; commandContext: CommandRuntimeContext; onFailure?: (error: unknown) => void },
): Promise<RoleSyncCounts> {
  const counts: RoleSyncCounts = { processed: 0, updated: 0, unchanged: 0, failed: 0, skipped: 0 }
  const reader = container.resolve<EntityManager>('em').fork()
  const persons = await reader.find(
    Person,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null, userId: { $ne: null } },
    { fields: ['id', 'userId', 'birthDate'], orderBy: { id: 'asc' } },
  )
  for (const person of persons) {
    counts.processed += 1
    const em = container.resolve<EntityManager>('em').fork()
    try {
      let outcome: PersonRoleSyncOutcome = 'no_account'
      await withAtomicFlush(
        em,
        [
          async () => {
            outcome = await syncPersonRolesInTransaction(em, person, { ...options, scope })
          },
        ],
        { transaction: true, label: 'people.role_sync.job' },
      )
      const result = outcome as PersonRoleSyncOutcome
      if (result === 'updated') counts.updated += 1
      else if (result === 'unchanged') counts.unchanged += 1
      else counts.skipped += 1
    } catch (error: unknown) {
      counts.failed += 1
      options.onFailure?.(error)
    }
  }
  return counts
}
