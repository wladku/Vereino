// The names of `GET /api/payments/lookups` (#245): read through the owning modules' DI directories (groups, activities,
// sections, persons) and, for the person select before anything is typed, the persons the club already charges.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { z } from 'zod'
import { Charge } from '../data/entities'
import type { lookupsQuerySchema } from '../data/validators'
import { personLabel, type LookupItem } from '../lib/lookups'
import { findPersons, listActivities, listGroups, listSections, searchPersonIds, type PaymentsScope } from './directory'

/** How many charged persons the person select offers before anything is typed. */
const CHARGED_PERSONS_LIMIT = 200

type Container = AwilixContainer
type Query = z.infer<typeof lookupsQuerySchema>

async function chargedPersonIds(em: EntityManager, scope: PaymentsScope): Promise<string[]> {
  const rows = await em.find(
    Charge,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
    { fields: ['id', 'personId', 'payerPersonId'], orderBy: { createdAt: 'desc' }, limit: CHARGED_PERSONS_LIMIT * 4 },
  )
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.personId) ids.add(row.personId)
    if (row.payerPersonId) ids.add(row.payerPersonId)
  }
  return [...ids].slice(0, CHARGED_PERSONS_LIMIT)
}

async function personItems(container: Container, scope: PaymentsScope, query: Query): Promise<LookupItem[]> {
  let ids: string[]
  if (query.ids) ids = query.ids
  else if (query.search) ids = [...((await searchPersonIds(container, scope, query.search)) ?? [])]
  else ids = await chargedPersonIds(container.resolve<EntityManager>('em').fork(), scope)
  const persons = await findPersons(container, scope, ids)
  return [...persons.values()].map((person) => ({
    id: person.id,
    label: personLabel(person),
    sectionId: null,
    sectionName: null,
  }))
}

export async function lookupItems(container: Container, scope: PaymentsScope, query: Query): Promise<LookupItem[]> {
  if (query.kind === 'persons') return personItems(container, scope, query)
  if (query.kind === 'sections') {
    const sections = await listSections(container, scope)
    return sections.map((section) => ({ id: section.id, label: section.name, sectionId: null, sectionName: null }))
  }
  const sections = new Map((await listSections(container, scope)).map((section) => [section.id, section.name]))
  if (query.kind === 'activities') {
    const activities = await listActivities(container, scope)
    return activities.map((activity) => ({
      id: activity.id,
      label: activity.name,
      sectionId: activity.sectionId,
      sectionName: sections.get(activity.sectionId) ?? null,
    }))
  }
  const groups = await listGroups(container, scope, query.sectionId ? { sectionIds: [query.sectionId] } : null)
  return groups.map((group) => ({
    id: group.id,
    label: group.name,
    sectionId: group.sectionId,
    sectionName: sections.get(group.sectionId) ?? null,
  }))
}
