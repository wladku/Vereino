// The age "fits" rule of a group (people life-cycle spec REQ-L15/REQ-L16, DD-L17, #601), shared by the roster's bulk
// move in `groups` and the section sign-up form (sign-up form spec DD-J04): a team whose age category has a PZPN "U"
// range fits by birth year in a reference year; any other group fits by age in completed years on a date within its
// `age_from`–`age_to`. Pure: time is a parameter, nothing reads the database.
import { ageOn } from '#src/account-policy'
import type { CalendarDate } from '#src/calendar-date'

/**
 * The PZPN "U" range of an age category (REQ-L16, DD-L17; #384): a child belongs to "U{from}–U{to}" in a reference
 * year R when `R − birth year + 1` lies in the range. `uTo` null is open (Senior).
 */
export type AgeCategoryRange = { readonly uFrom: number; readonly uTo: number | null }

/**
 * The reference year of the birth-year rule (Q-L25, confirmed 2026-11-19): the calendar year in which the season
 * starts (2026/27 → 2026); without a season, the year of `fallbackDate` (the move date or today).
 */
export function referenceYear(seasonStartsOn: CalendarDate | null, fallbackDate: CalendarDate): number {
  return Number((seasonStartsOn ?? fallbackDate).slice(0, 4))
}

/** The birth years of a range in reference year R: `R − u_to + 1` … `R − u_from + 1`; `from` null when open. */
export type BirthYears = { readonly from: number | null; readonly to: number }

export function birthYearsOf(range: AgeCategoryRange, year: number): BirthYears {
  return { from: range.uTo === null ? null : year - range.uTo + 1, to: year - range.uFrom + 1 }
}

/** Whether a child born in `birthYear` belongs to the range in reference year R (DD-L17: by birth year, not by day). */
export function fitsAgeCategory(birthYear: number, range: AgeCategoryRange, year: number): boolean {
  const u = year - birthYear + 1
  return u >= range.uFrom && (range.uTo === null || u <= range.uTo)
}

/**
 * Whether a person's age in completed years on `date` lies within `ageFrom`–`ageTo` (either bound may be open). Null
 * when it cannot be told: the range is open on both sides, or there is no birth date.
 */
export function fitsAgeRange(
  birthDate: CalendarDate | null,
  date: CalendarDate,
  range: { ageFrom: number | null; ageTo: number | null },
): boolean | null {
  if (range.ageFrom === null && range.ageTo === null) return null
  if (!birthDate) return null
  const age = ageOn(birthDate, date)
  return (range.ageFrom === null || age >= range.ageFrom) && (range.ageTo === null || age <= range.ageTo)
}

/**
 * The rule a group applies (REQ-L15 with REQ-L16, AC-L16): `birth_years` for a team whose age category has a "U"
 * range (with the birth years for display), `age` for any other group with an age range.
 */
export type FitRule =
  | {
      kind: 'birth_years'
      uFrom: number
      uTo: number | null
      referenceYear: number
      from: number | null
      to: number
    }
  | { kind: 'age'; ageFrom: number | null; ageTo: number | null }

/** The rule of a group from its category range (if any) in reference year `year` and its ages; null for neither. */
export function fitRuleOf(
  category: AgeCategoryRange | null,
  year: number,
  ages: { ageFrom: number | null; ageTo: number | null },
): FitRule | null {
  if (category) {
    const { uFrom, uTo } = category
    return { kind: 'birth_years', uFrom, uTo, referenceYear: year, ...birthYearsOf(category, year) }
  }
  if (ages.ageFrom === null && ages.ageTo === null) return null
  return { kind: 'age', ageFrom: ages.ageFrom, ageTo: ages.ageTo }
}

/** Whether a person fits by `rule` on `date`; null without a rule or a birth date. */
export function fitsRule(birthDate: CalendarDate | null, date: CalendarDate, rule: FitRule | null): boolean | null {
  if (!rule || !birthDate) return null
  if (rule.kind === 'age') return fitsAgeRange(birthDate, date, rule)
  return fitsAgeCategory(Number(birthDate.slice(0, 4)), rule, rule.referenceYear)
}
