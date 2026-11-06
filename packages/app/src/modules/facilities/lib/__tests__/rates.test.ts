import { describe, expect, it } from '@jest/globals'
import {
  PUBLIC_RENTER_CATEGORIES,
  RENTER_CATEGORIES,
  conflictingRate,
  quoteRate,
  rateOn,
  rateSeasonProblem,
  type RentalRateShape,
} from '../rates'

const rate = (patch: Partial<RentalRateShape>): RentalRateShape => ({
  id: 'r',
  placeId: 'pitch',
  renterCategory: 'municipal_club',
  pricePer90: 15000,
  seasonFrom: null,
  seasonTo: null,
  includesLighting: false,
  validFrom: '2026-01-01',
  validTo: null,
  ...patch,
})

// The Orlik 2024 reference: municipal club 150 PLN, winter with lighting 220 PLN (November–March), external 350 PLN.
const WINTER = rate({
  id: 'winter',
  renterCategory: 'municipal_club_winter_lighting',
  pricePer90: 22000,
  seasonFrom: '11-01',
  seasonTo: '03-31',
  includesLighting: true,
})
const ORLIK = [
  rate({ id: 'club' }),
  WINTER,
  rate({ id: 'external', renterCategory: 'external_commercial', pricePer90: 35000 }),
]

describe('rental rates', () => {
  it('lists the categories and the public ones', () => {
    expect(RENTER_CATEGORIES).toEqual(['municipal_club', 'municipal_club_winter_lighting', 'external_commercial'])
    expect(PUBLIC_RENTER_CATEGORIES).toEqual(['municipal_club', 'external_commercial'])
  })

  it('checks the season bounds', () => {
    expect(rateSeasonProblem({ seasonFrom: null, seasonTo: null })).toBeNull()
    expect(rateSeasonProblem({ seasonFrom: '11-01', seasonTo: '03-31' })).toBeNull()
    expect(rateSeasonProblem({ seasonFrom: '11-01', seasonTo: null })).toBe('season_incomplete')
    expect(rateSeasonProblem({ seasonFrom: null, seasonTo: '03-31' })).toBe('season_incomplete')
    expect(rateSeasonProblem({ seasonFrom: '11-31', seasonTo: '03-31' })).toBe('season_malformed')
  })

  it('applies the winter rate when a quote falls in winter (#121 acceptance)', () => {
    expect(quoteRate(ORLIK, 'pitch', 'municipal_club', '2026-12-09')?.id).toBe('winter')
    expect(quoteRate(ORLIK, 'pitch', 'municipal_club', '2027-03-31')?.id).toBe('winter')
    expect(quoteRate(ORLIK, 'pitch', 'municipal_club', '2026-06-10')?.id).toBe('club')
    expect(quoteRate(ORLIK, 'pitch', 'external_commercial', '2026-12-09')?.id).toBe('external')
    expect(quoteRate(ORLIK, 'hall', 'municipal_club', '2026-12-09')).toBeNull()
  })

  it('ignores a winter rate without lighting or without a season for a municipal club', () => {
    const dark = [rate({ id: 'club' }), rate({ ...WINTER, id: 'dark', includesLighting: false })]
    expect(quoteRate(dark, 'pitch', 'municipal_club', '2026-12-09')?.id).toBe('club')
    const allYear = [rate({ id: 'club' }), rate({ ...WINTER, id: 'all-year-lit', seasonFrom: null, seasonTo: null })]
    expect(quoteRate(allYear, 'pitch', 'municipal_club', '2026-12-09')?.id).toBe('club')
  })

  it('prefers a seasonal rate of the category itself and respects validity', () => {
    const rates = [
      rate({ id: 'all-year' }),
      rate({ id: 'summer', seasonFrom: '04-01', seasonTo: '10-31', validTo: '2026-12-31' }),
    ]
    expect(rateOn(rates, 'pitch', 'municipal_club', '2026-06-01')?.id).toBe('summer')
    expect(rateOn(rates, 'pitch', 'municipal_club', '2026-11-15')?.id).toBe('all-year')
    expect(rateOn(rates, 'pitch', 'municipal_club', '2027-06-01')?.id).toBe('all-year')
    expect(rateOn(rates, 'pitch', 'municipal_club', '2025-06-01')).toBeNull()
  })

  it('refuses an ambiguous second rate for the same place, category, period and season', () => {
    expect(conflictingRate(rate({ id: 'new' }), ORLIK)?.id).toBe('club')
    expect(conflictingRate(rate({ id: 'club' }), ORLIK)).toBeNull()
    expect(conflictingRate(rate({ id: 'new', validFrom: '2020-01-01', validTo: '2020-12-31' }), ORLIK)).toBeNull()
    expect(conflictingRate(rate({ id: 'new', placeId: 'hall' }), ORLIK)).toBeNull()
    // A seasonal rate next to an all-year one is fine; two seasons sharing a day are not.
    expect(conflictingRate(rate({ id: 'new', seasonFrom: '11-01', seasonTo: '03-31' }), ORLIK)).toBeNull()
    const spring = rate({ ...WINTER, id: 'new', seasonFrom: '03-31', seasonTo: '04-30' })
    expect(conflictingRate(spring, ORLIK)?.id).toBe('winter')
    expect(conflictingRate(rate({ ...spring, seasonFrom: '04-01', seasonTo: '10-31' }), ORLIK)).toBeNull()
  })
})
