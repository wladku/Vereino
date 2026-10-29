// The `club_core` directory, registered in DI as `clubCoreDirectory` (club spec *Architecture*: modules that require
// `club_core` reach its records through DI, never through its entities). `groups` checks that a group's section and
// an external team's institution exist and shows their names next to records it has already authorized (#30);
// `activities` reads places — their names, capacity and the place tree its conflict check projects (#31).
import type { EntityManager } from '@mikro-orm/postgresql'
import { Institution, Place, Section } from '../data/entities'
import { loadPlaceParents } from '../data/queries'
import { placeRelatives } from '../lib/places'

export type ClubDirectoryScope = { tenantId: string; organizationId: string }

export type SectionDirectoryEntry = { id: string; name: string; isActive: boolean }

export type InstitutionDirectoryEntry = { id: string; name: string }

export type PlaceDirectoryEntry = {
  id: string
  name: string
  parentPlaceId: string | null
  /** How many club groups can use the place at the same time (club spec glossary *Place*). */
  capacityGroups: number
  isActive: boolean
}

/** A place as a selector shows it. */
export type PlaceOption = {
  id: string
  name: string
  parentName: string | null
  capacityGroups: number
  isLeaf: boolean
}

/** A place with its ancestors and descendants in the live tree of the club. */
export type PlaceFamily = { place: PlaceDirectoryEntry; ancestorIds: string[]; descendantIds: string[] }

export type ClubCoreDirectory = {
  /** The live sections of the organization among `ids`, by id; `em` is the caller's when given. */
  findSections(
    scope: ClubDirectoryScope,
    ids: readonly string[],
    em?: EntityManager,
  ): Promise<Map<string, SectionDirectoryEntry>>
  /** The live institutions of the organization among `ids`, by id (names only; contacts stay encrypted here). */
  findInstitutions(
    scope: ClubDirectoryScope,
    ids: readonly string[],
    em?: EntityManager,
  ): Promise<Map<string, InstitutionDirectoryEntry>>
  /** The live places of the organization among `ids`, by id (names, parent, capacity; contacts stay encrypted). */
  findPlaces(
    scope: ClubDirectoryScope,
    ids: readonly string[],
    em?: EntityManager,
  ): Promise<Map<string, PlaceDirectoryEntry>>
  /** A live place with its ancestors and descendants, or null for an unknown place. */
  placeFamily(scope: ClubDirectoryScope, placeId: string, em?: EntityManager): Promise<PlaceFamily | null>
  /** The live active places of the club for a selector, by name; a leaf takes sessions and bookings. */
  placeOptions(scope: ClubDirectoryScope, em?: EntityManager): Promise<PlaceOption[]>
}

export async function findSections(
  em: EntityManager,
  scope: ClubDirectoryScope,
  ids: readonly string[],
): Promise<Map<string, SectionDirectoryEntry>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Section,
    { id: { $in: unique }, ...scope, deletedAt: null },
    { fields: ['id', 'name', 'isActive'] },
  )
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, isActive: row.isActive }]))
}

export async function findInstitutions(
  em: EntityManager,
  scope: ClubDirectoryScope,
  ids: readonly string[],
): Promise<Map<string, InstitutionDirectoryEntry>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Institution,
    { id: { $in: unique }, ...scope, deletedAt: null },
    { fields: ['id', 'name'] },
  )
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name }]))
}

export async function findPlaces(
  em: EntityManager,
  scope: ClubDirectoryScope,
  ids: readonly string[],
): Promise<Map<string, PlaceDirectoryEntry>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Place,
    { id: { $in: unique }, ...scope, deletedAt: null },
    { fields: ['id', 'name', 'parentPlaceId', 'capacityGroups', 'isActive'] },
  )
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        parentPlaceId: row.parentPlaceId ?? null,
        capacityGroups: row.capacityGroups,
        isActive: row.isActive,
      },
    ]),
  )
}

export async function placeFamily(
  em: EntityManager,
  scope: ClubDirectoryScope,
  placeId: string,
): Promise<PlaceFamily | null> {
  const place = (await findPlaces(em, scope, [placeId])).get(placeId)
  if (!place) return null
  return { place, ...placeRelatives(placeId, await loadPlaceParents(em, scope)) }
}

export async function placeOptions(em: EntityManager, scope: ClubDirectoryScope): Promise<PlaceOption[]> {
  const rows = await em.find(
    Place,
    { ...scope, deletedAt: null },
    { fields: ['id', 'name', 'parentPlaceId', 'capacityGroups', 'isActive'], orderBy: { name: 'asc' } },
  )
  const names = new Map(rows.map((row) => [row.id, row.name]))
  const parents = new Set(rows.flatMap((row) => (row.parentPlaceId ? [row.parentPlaceId] : [])))
  return rows
    .filter((row) => row.isActive)
    .map((row) => ({
      id: row.id,
      name: row.name,
      parentName: row.parentPlaceId ? (names.get(row.parentPlaceId) ?? null) : null,
      capacityGroups: row.capacityGroups,
      isLeaf: !parents.has(row.id),
    }))
}

export function createClubCoreDirectory(getEm: () => EntityManager): ClubCoreDirectory {
  return {
    findSections: (scope, ids, em) => findSections(em ?? getEm().fork(), scope, ids),
    findInstitutions: (scope, ids, em) => findInstitutions(em ?? getEm().fork(), scope, ids),
    findPlaces: (scope, ids, em) => findPlaces(em ?? getEm().fork(), scope, ids),
    placeFamily: (scope, placeId, em) => placeFamily(em ?? getEm().fork(), scope, placeId),
    placeOptions: (scope, em) => placeOptions(em ?? getEm().fork(), scope),
  }
}
