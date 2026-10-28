// The `club_core` places service, registered in DI as `clubCorePlaces` (club spec glossary *Place*): the leaf rule
// the session (`activities`, phase 2) and booking (`facilities`, phase 5) commands call before they point a session or
// a booking at a place. A consumer resolves it with `hasRegistration`; the rule itself is `bookablePlaceProblem`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { clubCoreErrors } from '../api/errors'
import { Place } from '../data/entities'
import { countPlaceChildren } from '../data/queries'
import { bookablePlaceProblem } from '../lib/places'

export type ClubPlacesScope = { tenantId: string; organizationId: string }

export type ClubCorePlacesService = {
  /**
   * Resolves when the place is a live place of the organization without live children; throws 404 for an unknown
   * place and 422 `place_not_bookable` for a place with children (a complex is booked through its pitches, hall or
   * pool). `em` is the caller's transactional EntityManager when given, so the check runs in its transaction.
   */
  assertBookableLeaf(scope: ClubPlacesScope, placeId: string, em?: EntityManager): Promise<void>
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

export function createClubCorePlacesService(getEm: () => EntityManager): ClubCorePlacesService {
  return {
    assertBookableLeaf: (scope, placeId, em) => assertBookableLeaf(em ?? getEm().fork(), scope, placeId),
  }
}
