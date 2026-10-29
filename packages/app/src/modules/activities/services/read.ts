// Reads behind the `activities` routes: one activity or session of the trusted tenant and organization (the detail
// routes check it with `assertInScope`) and the names a list shows next to the rows the scope filter already admitted
// (groups, sections, places, coaches — from the required modules' directories, never their entities).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Activity, Occurrence } from '../data/entities'
import { findGroups, findPersons, findPlaces, findSections, type ActivitiesScope } from './directory'

export async function findActivity(
  container: AwilixContainer,
  scope: ActivitiesScope,
  id: string,
): Promise<Activity | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return em.findOne(Activity, { id, ...scope, deletedAt: null })
}

export async function findOccurrence(
  container: AwilixContainer,
  scope: ActivitiesScope,
  id: string,
): Promise<Occurrence | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return em.findOne(Occurrence, { id, ...scope, deletedAt: null })
}

/** Activity names and types by id, and whether each is a weekly series. */
export async function activityLabels(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
): Promise<Map<string, { name: string; type: string; recurring: boolean }>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await em.find(
    Activity,
    { id: { $in: unique }, ...scope },
    { fields: ['id', 'name', 'type', 'recurrenceRule'] },
  )
  return new Map(
    rows.map((row) => [row.id, { name: row.name, type: row.type, recurring: Boolean(row.recurrenceRule) }]),
  )
}

export type NameMaps = {
  groups: Map<string, string>
  sections: Map<string, string>
  places: Map<string, string>
  persons: Map<string, string>
}

/** The display names of the referenced groups, sections, places and persons. */
export async function nameMaps(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: { groupIds: string[]; sectionIds: string[]; placeIds: string[]; personIds: string[] },
): Promise<NameMaps> {
  const clean = (values: string[]) => values.filter((value) => typeof value === 'string' && value.length > 0)
  const [groups, sections, places, persons] = await Promise.all([
    findGroups(container, scope, clean(ids.groupIds)),
    findSections(container, scope, clean(ids.sectionIds)),
    findPlaces(container, scope, clean(ids.placeIds)),
    findPersons(container, scope, clean(ids.personIds)),
  ])
  return {
    groups: new Map([...groups.values()].map((entry) => [entry.id, entry.name])),
    sections: new Map([...sections.values()].map((entry) => [entry.id, entry.name])),
    places: new Map([...places.values()].map((entry) => [entry.id, entry.name])),
    persons: new Map([...persons.values()].map((entry) => [entry.id, `${entry.firstName} ${entry.lastName}`])),
  }
}
