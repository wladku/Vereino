// Where a session takes place, as the session record shows it (REQ-A05 of the groups and activities parity spec,
// glossary *Map link*; #268): the place's name with its address, and a map link — the pinned OpenStreetMap view for a
// place with coordinates, else an OpenStreetMap search built from the name and the address; no link without either.
// Pure, so the panel record and the member pages share one rule.

export type PlaceLocation = {
  name: string | null
  address: string | null
  geoLat: number | null
  geoLng: number | null
}

/** The OpenStreetMap link of a place, or null when it has neither coordinates nor an address. */
export function placeMapHref(place: PlaceLocation): string | null {
  if (place.geoLat !== null && place.geoLng !== null) {
    const lat = String(place.geoLat)
    const lng = String(place.geoLng)
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
  }
  const address = place.address?.trim()
  if (!address) return null
  const query = [place.name?.trim(), address].filter(Boolean).join(', ')
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`
}

/** "Name, address" — the name alone without an address, the address alone without a name; null without both. */
export function placeLine(place: Pick<PlaceLocation, 'name' | 'address'>): string | null {
  const parts = [place.name?.trim(), place.address?.trim()].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(', ') : null
}

// --- Typed venue (REQ-A08, DD-A03, #270) ---

/** The limits of a typed venue, as `venueSchema` and the check constraints set them. */
export const VENUE_NAME_MIN = 2
export const VENUE_NAME_MAX = 120
export const VENUE_ADDRESS_MIN = 5
export const VENUE_ADDRESS_MAX = 300

/** A venue typed in as a name and an address: an away pitch, never added to the club's places. */
export type TypedVenue = { name: string; address: string }

/** Where a session is: a club place or a typed venue, exactly one. */
export type SessionLocation = { placeId: string; venue: null } | { placeId: null; venue: TypedVenue }

/**
 * The location a write asks for (glossary *Typed venue*): a club place or a typed venue, never both and never neither —
 * `venue_or_place_required` otherwise. A null counts as not given.
 */
export function chooseLocation(input: {
  placeId?: string | null
  venue?: TypedVenue | null
}): { ok: true; location: SessionLocation } | { ok: false; code: 'venue_or_place_required' } {
  const placeId = input.placeId ?? null
  const venue = input.venue ?? null
  if (placeId !== null && venue === null) return { ok: true, location: { placeId, venue: null } }
  if (placeId === null && venue !== null) return { ok: true, location: { placeId: null, venue } }
  return { ok: false, code: 'venue_or_place_required' }
}

/** The stored venue columns as a venue, or null when the row has a club place. */
export function storedVenue(row: { venueName?: string | null; venueAddress?: string | null }): TypedVenue | null {
  return row.venueName ? { name: row.venueName, address: row.venueAddress ?? '' } : null
}

/** A typed venue as a location without coordinates, so `placeMapHref` and `placeLine` build its search link and line. */
export function venueLocation(venue: TypedVenue): PlaceLocation {
  return { name: venue.name, address: venue.address, geoLat: null, geoLng: null }
}

/** "Away" defaults to on with a typed venue (Q-A25); the user's own choice wins. */
export function awayByDefault(venue: TypedVenue | null, isAway: boolean | undefined): boolean {
  return isAway ?? venue !== null
}
