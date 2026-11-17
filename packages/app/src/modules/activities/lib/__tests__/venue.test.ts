import { describe, expect, it } from '@jest/globals'
import { placeLine, placeMapHref } from '../venue'

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
