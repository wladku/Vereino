import { describe, expect, it } from '@jest/globals'
import { publicFacilitiesLoadOf } from '../public-load'

const club = { name: 'KS Orzeł', slug: 'orzel' }

describe('publicFacilitiesLoadOf', () => {
  it('answers the page of a 200 with a body', () => {
    expect(publicFacilitiesLoadOf({ ok: true, status: 200, body: { places: [] } })).toEqual({
      status: 'ok',
      page: { places: [] },
    })
  })

  it('keeps the club header of a 404 and tells a club without public calendars from a missing club', () => {
    expect(publicFacilitiesLoadOf({ ok: false, status: 404, body: { code: 'public_places_disabled', club } })).toEqual({
      status: 'disabled',
      club,
    })
    expect(publicFacilitiesLoadOf({ ok: false, status: 404, body: { code: 'public_place_not_found', club } })).toEqual({
      status: 'not_found',
      club,
    })
    expect(publicFacilitiesLoadOf({ ok: false, status: 404, body: null })).toEqual({ status: 'not_found', club: null })
    expect(publicFacilitiesLoadOf({ ok: false, status: 404, body: 'gone' })).toEqual({
      status: 'not_found',
      club: null,
    })
  })

  it('answers a month outside the readable range', () => {
    expect(
      publicFacilitiesLoadOf({ ok: false, status: 400, body: { code: 'public_schedule_month_invalid', club } }),
    ).toEqual({ status: 'month_invalid', club })
  })

  it('answers null for a failed request', () => {
    expect(publicFacilitiesLoadOf({ ok: true, status: 200, body: null })).toBeNull()
    expect(publicFacilitiesLoadOf({ ok: false, status: 400, body: { code: 'other' } })).toBeNull()
    expect(publicFacilitiesLoadOf({ ok: false, status: 429, body: { error: 'Too many' } })).toBeNull()
  })
})
