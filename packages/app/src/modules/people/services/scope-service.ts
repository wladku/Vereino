// `people.scopeService` (foundation spec DD-F03, P-03): the single scope provider, registered under the foundation's
// `vereino.scopeProvider` token. It returns the grants of the person linked to the user — club_admin, coordinator
// sections, guardian wards, self — computed on today's date in the club zone; no linked person → no grants.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { Scope } from '@vereino/core'
import type { ScopeProvider, ScopeSubject } from '@/modules/foundation'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { personScope } from '../lib/people-rules'
import { clubToday } from './club-clock'

/** The grants of the person `personId` on `today`, read with `em` (scoped to the subject's organization). */
export async function loadPersonScope(
  em: EntityManager,
  subject: { personId: string; tenantId: string; organizationId: string },
  today: string,
): Promise<Scope> {
  const where = { tenantId: subject.tenantId, organizationId: subject.organizationId, deletedAt: null }
  const assignments = await em.find(
    RoleAssignment,
    { ...where, personId: subject.personId },
    { fields: ['id', 'role', 'sectionId', 'validFrom', 'validTo'] },
  )
  const guardianships = await em.find(
    Guardianship,
    { ...where, guardianPersonId: subject.personId },
    { fields: ['id', 'wardPersonId', 'validFrom', 'validTo'] },
  )
  return personScope(
    {
      personId: subject.personId,
      assignments: assignments.map((row) => ({
        role: row.role,
        sectionId: row.sectionId ?? null,
        validFrom: row.validFrom,
        validTo: row.validTo ?? null,
      })),
      guardianships: guardianships.map((row) => ({
        wardPersonId: row.wardPersonId,
        validFrom: row.validFrom,
        validTo: row.validTo ?? null,
      })),
    },
    today,
  )
}

export function createPeopleScopeService(container: AwilixContainer): ScopeProvider {
  return {
    async grantsForUser(subject: ScopeSubject): Promise<Scope> {
      const em = container.resolve<EntityManager>('em').fork()
      const person = await em.findOne(
        Person,
        {
          userId: subject.userId,
          tenantId: subject.tenantId,
          organizationId: subject.organizationId,
          deletedAt: null,
        },
        { fields: ['id'] },
      )
      if (!person) return []
      const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
      const today = await clubToday(container, scope)
      return loadPersonScope(em, { ...scope, personId: person.id }, today)
    },
  }
}
