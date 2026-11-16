// Which places a staff reader of the facility calendar and "Today at the facility" sees (facilities spec the calendar
// and today row of *API*: "place scope applies to callers with `place_ids` (facility attendant) … other staff read all
// club places"; #126). Pure: the grants come from the scope contract.
import type { GrantKind, Scope } from '@vereino/core'

/** Grants that read every club place: the administrator, and the coordinators and coaches who book internally. */
const CLUB_READER_KINDS: readonly GrantKind[] = ['club_admin', 'coordinator', 'coach']

/**
 * The places a reader with `facilities.view` sees, or null for the whole club. A caller whose facility access comes
 * from a `facility_operator` grant only reads its places (the assigned places and their descendants) and the places
 * they maintain; a club-wide or club-staff grant, or no attendant grant at all, keeps the whole club.
 */
export function attendantPlaceIds(grants: Scope): string[] | null {
  if (grants.some((grant) => CLUB_READER_KINDS.includes(grant.kind))) return null
  const attended = grants.filter((grant) => grant.kind === 'facility_operator')
  if (attended.length === 0) return null
  const maintained = grants.filter((grant) => grant.kind === 'maintenance_planner')
  return [...new Set([...attended, ...maintained].flatMap((grant) => [...(grant.ids ?? [])]))].sort()
}

/** The places of `grants` of one kind, sorted and without repeats. */
function grantedPlaceIds(grants: Scope, kind: GrantKind): string[] {
  return [...new Set(grants.filter((grant) => grant.kind === kind).flatMap((grant) => [...(grant.ids ?? [])]))].sort()
}

/**
 * The places `GET /api/facilities/options/places` lists (facilities parity spec DD-R06, #275), or null for the whole
 * club: a reader with `facilities.view` as the calendar reads it (`attendantPlaceIds`); a maintainer without it the
 * places assigned to them, unless they also hold the club-wide grant.
 */
export function optionPlaceIds(grants: Scope, canView: boolean): string[] | null {
  if (canView) return attendantPlaceIds(grants)
  if (grants.some((grant) => grant.kind === 'club_admin')) return null
  return grantedPlaceIds(grants, 'maintenance_planner')
}

/**
 * The places whose rentals the caller manages (facilities parity spec DD-R18, #275; the rental list's own scope): null
 * for every place (the club administrator), the places of the `facility_operator` grant, or none without
 * `facilities.rentals.manage`. Only there the calendar and "today" return the renter's contact.
 */
export function rentalPlaceIds(grants: Scope, canManageRentals: boolean): string[] | null {
  if (!canManageRentals) return []
  if (grants.some((grant) => grant.kind === 'club_admin')) return null
  return grantedPlaceIds(grants, 'facility_operator')
}

/** Whether `placeId` lies in a place list (null = every place). */
export function inPlaces(placeIds: readonly string[] | null, placeId: string): boolean {
  return placeIds === null || placeIds.includes(placeId)
}

/**
 * A bookable place (facilities parity spec glossary *Bookable place*, #275): active — the option source lists only
 * active places —, a leaf and not external.
 */
export function isBookablePlace(place: { isLeaf: boolean; isExternal: boolean }): boolean {
  return place.isLeaf && !place.isExternal
}

/**
 * The family of `placeId` among the listed places — the place, its ancestors and its descendants — from the options'
 * `parentId` links (the entries a card of `/club/places` counts, #275).
 */
export function placeFamilyOf(
  places: ReadonlyArray<{ id: string; parentId: string | null }>,
  placeId: string,
): Set<string> {
  const parentOf = new Map(places.map((place) => [place.id, place.parentId]))
  const family = new Set([placeId])
  for (
    let parent = parentOf.get(placeId) ?? null;
    parent && !family.has(parent);
    parent = parentOf.get(parent) ?? null
  ) {
    family.add(parent)
  }
  const descendants = [placeId]
  while (descendants.length > 0) {
    const current = descendants.pop() as string
    for (const place of places) {
      if (place.parentId === current && !family.has(place.id)) {
        family.add(place.id)
        descendants.push(place.id)
      }
    }
  }
  return family
}
