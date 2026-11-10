// The places of a facility attendant's assignments (`people_role_assignments.place_id`, #126) through `club_core`'s
// directory (club spec *Record scope* → `place_ids`: the place and its descendants). Resolved through DI with
// `hasRegistration`, like the club clock: without `club_core` there is no place tree, so each place covers itself only,
// and a role assignment cannot name a place (fail closed).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { ClubCoreDirectory } from '../../club_core/services/directory'

/** DI token of `club_core`'s directory. */
const CLUB_CORE_DIRECTORY = 'clubCoreDirectory'

type ClubScope = { tenantId: string; organizationId: string }

function directory(container: AwilixContainer): ClubCoreDirectory | null {
  if (!container.hasRegistration(CLUB_CORE_DIRECTORY)) return null
  return container.resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY)
}

/** The live descendants of each place of `placeIds`, by place id; an unknown place is left out (covers itself). */
export async function placeDescendants(
  container: AwilixContainer,
  em: EntityManager,
  scope: ClubScope,
  placeIds: readonly string[],
): Promise<Record<string, string[]>> {
  const places = directory(container)
  const result: Record<string, string[]> = {}
  if (!places) return result
  const trusted = { tenantId: scope.tenantId, organizationId: scope.organizationId }
  for (const placeId of new Set(placeIds)) {
    const family = await places.placeFamily(trusted, placeId, em)
    if (family) result[placeId] = family.descendantIds
  }
  return result
}

/** True when `placeId` is a live place of the club (false without `club_core`). */
export async function isClubPlace(
  container: AwilixContainer,
  em: EntityManager,
  scope: ClubScope,
  placeId: string,
): Promise<boolean> {
  const places = directory(container)
  if (!places) return false
  // Only the trusted scope reaches the query: the directory spreads it into the filter.
  const trusted = { tenantId: scope.tenantId, organizationId: scope.organizationId }
  return (await places.findPlaces(trusted, [placeId], em)).has(placeId)
}
