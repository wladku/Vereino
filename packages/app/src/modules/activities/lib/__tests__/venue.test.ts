import { describe, expect, it } from '@jest/globals'
import {
  awayByDefault,
  cardMapHref,
  chooseLocation,
  placeLine,
  placeMapHref,
  storedVenue,
  venueLocation,
} from '../venue'

// #268 (REQ-A05, glossary *Map link*): the session record's place line and map link.
describe('placeMapHref', () => {
  it('pins a place with coordinates', () => {
    expect(placeMapHref({ name: 'Orlik', address: 'ul. Sportowa 1', geoLat: 50.06, geoLng: 19.94 })).toBe(
      'https://www.openstreetmap.org/?mlat=50.06&mlon=19.94#map=17/50.06/19.94',
    )
  })

  it('searches the name and the address of a place without coordinates', () => {
    expect(placeMapHref({ name: 'Hala', address: 'ul. Długa 2, Kraków', geoLat: null, geoLng: 19.9 })).toBe(
      'https://www.openstreetmap.org/search?query=Hala%2C%20ul.%20D%C5%82uga%202%2C%20Krak%C3%B3w',
    )
    expect(placeMapHref({ name: null, address: 'ul. Długa 2', geoLat: null, geoLng: null })).toBe(
      'https://www.openstreetmap.org/search?query=ul.%20D%C5%82uga%202',
    )
  })

  it('has no link without coordinates and without an address', () => {
    expect(placeMapHref({ name: 'Hala', address: null, geoLat: null, geoLng: null })).toBeNull()
    expect(placeMapHref({ name: 'Hala', address: '  ', geoLat: 50, geoLng: null })).toBeNull()
  })
})

describe('placeLine', () => {
  it('joins the name and the address, or shows whichever exists', () => {
    expect(placeLine({ name: 'Hala', address: 'ul. Długa 2' })).toBe('Hala, ul. Długa 2')
    expect(placeLine({ name: 'Hala', address: null })).toBe('Hala')
    expect(placeLine({ name: null, address: ' ul. Długa 2 ' })).toBe('ul. Długa 2')
    expect(placeLine({ name: ' ', address: null })).toBeNull()
  })
})

// #270 (REQ-A08, DD-A03, Q-A25): a club place or a typed venue, its map link, and "away" by default.
describe('chooseLocation', () => {
  const venue = { name: 'Stadion Wisły Liszki', address: 'ul. Sportowa 1, Liszki' }

  it('takes a club place or a typed venue', () => {
    expect(chooseLocation({ placeId: 'p1' })).toEqual({ ok: true, location: { placeId: 'p1', venue: null } })
    expect(chooseLocation({ placeId: null, venue })).toEqual({ ok: true, location: { placeId: null, venue } })
  })

  it('refuses both and neither', () => {
    expect(chooseLocation({ placeId: 'p1', venue })).toEqual({ ok: false, code: 'venue_or_place_required' })
    expect(chooseLocation({})).toEqual({ ok: false, code: 'venue_or_place_required' })
    expect(chooseLocation({ placeId: null, venue: null })).toEqual({ ok: false, code: 'venue_or_place_required' })
  })
})

describe('storedVenue and venueLocation', () => {
  it('reads the venue columns, or null for a club place', () => {
    expect(storedVenue({ venueName: 'Orlik', venueAddress: 'ul. Polna 3' })).toEqual({
      name: 'Orlik',
      address: 'ul. Polna 3',
    })
    expect(storedVenue({ venueName: 'Orlik', venueAddress: null })).toEqual({ name: 'Orlik', address: '' })
    expect(storedVenue({ venueName: null, venueAddress: null })).toBeNull()
    expect(storedVenue({})).toBeNull()
  })

  it('searches a typed venue on the map', () => {
    const location = venueLocation({ name: 'Orlik', address: 'ul. Polna 3' })
    expect(location).toEqual({ name: 'Orlik', address: 'ul. Polna 3', geoLat: null, geoLng: null })
    expect(placeMapHref(location)).toBe('https://www.openstreetmap.org/search?query=Orlik%2C%20ul.%20Polna%203')
    expect(placeLine(location)).toBe('Orlik, ul. Polna 3')
  })
})

describe('awayByDefault', () => {
  it('turns away on with a typed venue unless the user chose', () => {
    const venue = { name: 'Orlik', address: 'ul. Polna 3' }
    expect(awayByDefault(venue, undefined)).toBe(true)
    expect(awayByDefault(venue, false)).toBe(false)
    expect(awayByDefault(null, undefined)).toBe(false)
    expect(awayByDefault(null, true)).toBe(true)
  })
})

describe('cardMapHref (E10-S07, REQ-A13)', () => {
  const away = { name: 'Stadion', address: 'ul. Sportowa 1, Liszki', geoLat: null, geoLng: null }

  it('links the map of an external place or a typed venue', () => {
    expect(cardMapHref({ ...away, placeExternal: true })).toBe(placeMapHref(away))
  })

  it('shows no link for a club place or without an address', () => {
    expect(cardMapHref({ ...away, placeExternal: false })).toBeNull()
    expect(cardMapHref(away)).toBeNull()
    expect(cardMapHref({ ...away, address: null, placeExternal: true })).toBeNull()
  })
})
