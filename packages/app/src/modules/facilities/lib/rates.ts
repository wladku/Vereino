// Pure rules of the rental rates (facilities spec *Data Models* → `facilities_rental_rates`; REQ-013; #121): a price
// per 90-minute unit for a place and a renter category, optionally limited to a season `MM-DD`–`MM-DD` (the winter
// season, which may wrap the year end) and a validity period. The rate of a booking date is the seasonal rate whose
// season covers the date, else the all-year rate. `municipal_club_winter_lighting` is a staff-only category: staff
// apply it to a `municipal_club` renter when the date falls in its season and the rate includes lighting.
import { isMonthDay, periodsOverlap, seasonCovers, type CalendarDate, type Validity } from '@vereino/core'

export const RENTER_CATEGORIES = ['municipal_club', 'municipal_club_winter_lighting', 'external_commercial'] as const
export type RenterCategory = (typeof RENTER_CATEGORIES)[number]

/** The categories the public request form offers (the winter-lighting rate is applied by staff). */
export const PUBLIC_RENTER_CATEGORIES: readonly RenterCategory[] = ['municipal_club', 'external_commercial']

export type RentalRateShape = {
  readonly id?: string
  readonly placeId: string
  readonly renterCategory: RenterCategory
  /** Minor units (grosz) per 90-minute unit. */
  readonly pricePer90: number
  readonly seasonFrom: string | null
  readonly seasonTo: string | null
  readonly includesLighting: boolean
  readonly validFrom: CalendarDate
  readonly validTo: CalendarDate | null
}

/** Why a rate's season is not valid, or null (422 `rental_rate_season_invalid`): both bounds `MM-DD`, or neither. */
export function rateSeasonProblem(rate: Pick<RentalRateShape, 'seasonFrom' | 'seasonTo'>): string | null {
  if (rate.seasonFrom === null && rate.seasonTo === null) return null
  if (rate.seasonFrom === null || rate.seasonTo === null) return 'season_incomplete'
  if (!isMonthDay(rate.seasonFrom) || !isMonthDay(rate.seasonTo)) return 'season_malformed'
  return null
}

function season(rate: Pick<RentalRateShape, 'seasonFrom' | 'seasonTo'>): { from: string; to: string } | null {
  return rate.seasonFrom !== null && rate.seasonTo !== null ? { from: rate.seasonFrom, to: rate.seasonTo } : null
}

/** True when two seasons (or two all-year rates) share a day; an all-year rate and a seasonal one never clash. */
function seasonsClash(a: RentalRateShape, b: RentalRateShape): boolean {
  const first = season(a)
  const second = season(b)
  if (first === null || second === null) return first === second
  for (let date = '2028-01-01'; date <= '2028-12-31'; date = nextDay(date)) {
    if (seasonCovers(first, date) && seasonCovers(second, date)) return true
  }
  return false
}

function nextDay(date: CalendarDate): CalendarDate {
  const probe = new Date(`${date}T00:00:00Z`)
  probe.setUTCDate(probe.getUTCDate() + 1)
  return probe.toISOString().slice(0, 10)
}

function periodOf(rate: Pick<RentalRateShape, 'validFrom' | 'validTo'>): Validity {
  return { validFrom: rate.validFrom, validTo: rate.validTo }
}

/**
 * The existing rate a candidate would make ambiguous, or null (409 `rental_rate_overlap`): the same place and category,
 * overlapping validity, and either both all-year or seasons sharing a day.
 */
export function conflictingRate<T extends RentalRateShape>(
  candidate: RentalRateShape,
  existing: readonly T[],
): T | null {
  return (
    existing.find(
      (rate) =>
        rate.id !== candidate.id &&
        rate.placeId === candidate.placeId &&
        rate.renterCategory === candidate.renterCategory &&
        periodsOverlap(periodOf(rate), periodOf(candidate)) &&
        seasonsClash(rate, candidate),
    ) ?? null
  )
}

function inForce(rate: RentalRateShape, date: CalendarDate): boolean {
  return rate.validFrom <= date && (rate.validTo === null || date <= rate.validTo)
}

/** The rate of a category on a date: the seasonal rate covering it first, else the all-year rate; null when none. */
export function rateOn<T extends RentalRateShape>(
  rates: readonly T[],
  placeId: string,
  category: RenterCategory,
  date: CalendarDate,
): T | null {
  const candidates = rates.filter(
    (rate) => rate.placeId === placeId && rate.renterCategory === category && inForce(rate, date),
  )
  const seasonal = candidates.find((rate) => {
    const bounds = season(rate)
    return bounds !== null && seasonCovers(bounds, date)
  })
  return seasonal ?? candidates.find((rate) => season(rate) === null) ?? null
}

/**
 * The rate staff quote for a renter category on a date (REQ-013, J-005): a `municipal_club` renter gets the
 * winter-lighting rate when one with lighting covers the date; otherwise the category's own rate.
 */
export function quoteRate<T extends RentalRateShape>(
  rates: readonly T[],
  placeId: string,
  category: RenterCategory,
  date: CalendarDate,
): T | null {
  if (category === 'municipal_club') {
    const winter = rateOn(rates, placeId, 'municipal_club_winter_lighting', date)
    if (winter && winter.includesLighting && season(winter) !== null) return winter
  }
  return rateOn(rates, placeId, category, date)
}
