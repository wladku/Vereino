// The holders of a section-scoped role on several (section, day) pairs from one read of the assignments (the
// reschedule notices of a long closure, #394): the caller reads every assignment of the sections that overlaps the
// span of the days once, and this picks, for each pair, the persons whose assignment is active on that day.
import { Validity, type CalendarDate } from '@vereino/core'

/** One (section, day) pair a consumer asks about. */
export type SectionDay = { readonly sectionId: string; readonly date: CalendarDate }

/** A role assignment as read for the lookup: its person, its section and its validity period. */
export type SectionAssignment = {
  readonly personId: string
  readonly sectionId: string | null
  readonly validFrom: CalendarDate
  readonly validTo: CalendarDate | null
}

/** The key of a pair in the result of `holdersBySectionDay`: `<sectionId>:<date>`. */
export function sectionDayKey(pair: SectionDay): string {
  return `${pair.sectionId}:${pair.date}`
}

/** The first and the last day among `pairs`, or null when there is none (the span the single read covers). */
export function sectionDaysSpan(pairs: readonly SectionDay[]): { from: CalendarDate; to: CalendarDate } | null {
  if (pairs.length === 0) return null
  let from = pairs[0].date
  let to = pairs[0].date
  for (const { date } of pairs) {
    if (date < from) from = date
    if (date > to) to = date
  }
  return { from, to }
}

/**
 * The distinct person ids holding an assignment of the pair's section active on the pair's day, by `sectionDayKey`;
 * every pair has an entry (an empty list when nobody holds the role that day).
 */
export function holdersBySectionDay(
  pairs: readonly SectionDay[],
  assignments: readonly SectionAssignment[],
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const pair of pairs) {
    const ids = assignments
      .filter((row) => row.sectionId === pair.sectionId && Validity.isActiveAt(row, pair.date))
      .map((row) => row.personId)
    result.set(sectionDayKey(pair), [...new Set(ids)])
  }
  return result
}
