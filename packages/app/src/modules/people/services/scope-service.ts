// `people.scopeService` (foundation spec DD-F03, P-03): the single scope provider, registered under the foundation's
// `vereino.scopeProvider` token. It returns the grants of the person linked to the user — club_admin, coordinator
// sections, coached groups, guardian wards, self — computed on today's date in the club zone; no linked person → no
// grants; `grantsForPerson` returns the same grants for a token link's subject person (P-10). The coached groups come from the optional `groups` contribution (`membership-contribution.ts`, #30);
// a facility attendant's places with their descendants from `club_core`'s place tree (`place-scope.ts`, #126).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { Scope } from '@vereino/core'
import type { PersonScopeSubject, ScopeProvider, ScopeSubject } from '@/modules/foundation'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { personScope } from '../lib/people-rules'
import { clubToday } from './club-clock'
import { maintainerScopeProvider, type MaintainerScopeProvider } from './maintainer-scope'
import { membershipContribution, type MembershipContribution } from './membership-contribution'
import { placeDescendants } from './place-scope'

/** The descendants of a facility attendant's places, by place id (`club_core`'s live tree; none without it). */
export type PlaceDescendantsReader = (
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  placeIds: readonly string[],
) => Promise<Record<string, string[]>>

/**
 * The grants of the person `personId` on `today`, read with `em` (scoped to the subject's organization);
 * `contribution` is the optional `groups` contribution (null without `groups`), `maintainers` the optional
 * `facilities` maintainer scope (null without `facilities`, #128), `descendants` the place tree a facility
 * attendant's assignments expand over (#126; without it each place covers itself only).
 */
export async function loadPersonScope(
  em: EntityManager,
  subject: { personId: string; tenantId: string; organizationId: string },
  today: string,
  contribution: MembershipContribution | null = null,
  maintainers: MaintainerScopeProvider | null = null,
  descendants: PlaceDescendantsReader | null = null,
): Promise<Scope> {
  const where = { tenantId: subject.tenantId, organizationId: subject.organizationId, deletedAt: null }
  const assignments = await em.find(
    RoleAssignment,
    { ...where, personId: subject.personId },
    { fields: ['id', 'role', 'sectionId', 'placeId', 'validFrom', 'validTo'] },
  )
  const guardianships = await em.find(
    Guardianship,
    { ...where, guardianPersonId: subject.personId },
    { fields: ['id', 'wardPersonId', 'validFrom', 'validTo'] },
  )
  const coachedGroupIds = contribution ? await contribution.coachedGroupIds(em, subject, today) : []
  const maintenancePlaceIds = maintainers ? await maintainers.placeIdsFor(em, subject) : []
  const attendedPlaceIds = assignments.flatMap((row) =>
    row.role === 'facility_operator' && row.placeId ? [row.placeId] : [],
  )
  const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
  const placeTree = descendants && attendedPlaceIds.length > 0 ? await descendants(em, scope, attendedPlaceIds) : {}
  return personScope(
    {
      personId: subject.personId,
      coachedGroupIds,
      maintenancePlaceIds,
      placeDescendants: placeTree,
      assignments: assignments.map((row) => ({
        role: row.role,
        sectionId: row.sectionId ?? null,
        placeId: row.placeId ?? null,
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
      return loadPersonScope(
        em,
        { ...scope, personId: person.id },
        today,
        membershipContribution(container),
        maintainerScopeProvider(container),
        (db, placeScope, placeIds) => placeDescendants(container, db, placeScope, placeIds),
      )
    },
    // A token link's subject (foundation P-10): the person's current grants, read anew at every redemption.
    async grantsForPerson(subject: PersonScopeSubject): Promise<Scope> {
      const em = container.resolve<EntityManager>('em').fork()
      const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
      const person = await em.findOne(Person, { id: subject.personId, ...scope, deletedAt: null }, { fields: ['id'] })
      if (!person) return []
      const today = await clubToday(container, scope)
      return loadPersonScope(
        em,
        { ...scope, personId: person.id },
        today,
        membershipContribution(container),
        maintainerScopeProvider(container),
        (db, placeScope, placeIds) => placeDescendants(container, db, placeScope, placeIds),
      )
    },
  }
}
