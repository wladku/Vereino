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
