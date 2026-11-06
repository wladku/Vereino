// The `club_core` places service, registered in DI as `clubCorePlaces` (club spec glossary *Place*): the leaf rule
// the session (`activities`, phase 2) and booking (`facilities`, phase 5) commands call before they point a session or
// a booking at a place, and the inherited opening hours (facilities spec DD-41). A consumer resolves it with
// `hasRegistration`; the rules themselves are `bookablePlaceProblem` and `effectiveOpeningHours`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { clubCoreErrors } from '../api/errors'
import { Place } from '../data/entities'
import type { OpeningHours } from '@vereino/core'
import { countPlaceChildren, loadPlaceParents } from '../data/queries'
import { bookablePlaceProblem, effectiveOpeningHours } from '../lib/places'

export type ClubPlacesScope = { tenantId: string; organizationId: string }

export type ClubCorePlacesService = {
  /**
   * Resolves when the place is a live place of the organization without live children; throws 404 for an unknown
   * place and 422 `place_not_bookable` for a place with children (a complex is booked through its pitches, hall or
   * pool). `em` is the caller's transactional EntityManager when given, so the check runs in its transaction.
   */
  assertBookableLeaf(scope: ClubPlacesScope, placeId: string, em?: EntityManager): Promise<void>
  /**
   * The opening hours that apply to each live place (facilities spec DD-41): its own, else its nearest ancestor's;
   * null for no limit. Unknown ids are absent from the map.
   */
  openingHours(
    scope: ClubPlacesScope,
    placeIds: readonly string[],
    em?: EntityManager,
  ): Promise<Map<string, OpeningHours | null>>
}

export async function assertBookableLeaf(em: EntityManager, scope: ClubPlacesScope, placeId: string): Promise<void> {
  const place = await em.findOne(Place, { id: placeId, ...scope, deletedAt: null }, { fields: ['id'] })
  const problem = bookablePlaceProblem(place ? { childCount: await countPlaceChildren(em, scope, place.id) } : null)
  if (problem === 'not_found') {
    const { translate } = await resolveTranslations()
    throw notFound(translate('foundation.errors.not_found', 'Not found'))
  }
  if (problem === 'has_children') await clubCoreErrors.throw('place_not_bookable', { placeId })
}

export async function openingHoursOf(
  em: EntityManager,
  scope: ClubPlacesScope,
  placeIds: readonly string[],
): Promise<Map<string, OpeningHours | null>> {
  const result = new Map<string, OpeningHours | null>()
  if (placeIds.length === 0) return result
  const parents = await loadPlaceParents(em, scope)
  const rows = await em.find(
    Place,
    { ...scope, deletedAt: null, openingHours: { $ne: null } },
    { fields: ['id', 'openingHours'] },
  )
  const own = new Map<string, unknown>(rows.map((row) => [row.id, row.openingHours]))
  for (const placeId of new Set(placeIds)) {
    if (parents.has(placeId)) result.set(placeId, effectiveOpeningHours(placeId, parents, own))
  }
  return result
}

export function createClubCorePlacesService(getEm: () => EntityManager): ClubCorePlacesService {
  return {
    assertBookableLeaf: (scope, placeId, em) => assertBookableLeaf(em ?? getEm().fork(), scope, placeId),
    openingHours: (scope, placeIds, em) => openingHoursOf(em ?? getEm().fork(), scope, placeIds),
  }
}
