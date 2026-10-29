// The `club_core` directory, registered in DI as `clubCoreDirectory` (club spec *Architecture*: modules that require
// `club_core` reach its records through DI, never through its entities). `groups` checks that a group's section and
// an external team's institution exist and shows their names next to records it has already authorized (#30).
import type { EntityManager } from '@mikro-orm/postgresql'
import { Institution, Section } from '../data/entities'

export type ClubDirectoryScope = { tenantId: string; organizationId: string }

export type SectionDirectoryEntry = { id: string; name: string; isActive: boolean }

export type InstitutionDirectoryEntry = { id: string; name: string }

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

export function createClubCoreDirectory(getEm: () => EntityManager): ClubCoreDirectory {
  return {
    findSections: (scope, ids, em) => findSections(em ?? getEm().fork(), scope, ids),
    findInstitutions: (scope, ids, em) => findInstitutions(em ?? getEm().fork(), scope, ids),
  }
}
