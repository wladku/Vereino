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
