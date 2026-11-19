// The selection of the dashboard widget "Today at the facility" (facilities parity spec REQ-R20, README B-01; #290):
// today's entries of `GET /api/facilities/calendar` on the club's own places — an external place is not at the
// facility —, by start, at most eight shown and the rest counted for the "and N more" line. The calendar read is
// already narrowed to the caller's scope (an attendant reads only the assigned places), so the widget needs no role
// logic of its own.

/** How many entries the widget lists before the "and N more" line (B-01). */
export const TODAY_AT_FACILITY_SHOWN = 8

export type TodayPlace = { id: string; isExternal: boolean }
export type TodayEntry = { id: string; placeId: string; start: string }

export type TodayAtFacility<E extends TodayEntry> = {
  /** The entries to list, by start (then id, so the order is stable). */
  shown: E[]
  /** How many entries of today the list leaves out. */
  more: number
  /** The place of the first entry: the widget's link opens its calendar; null when nothing is scheduled. */
  firstPlaceId: string | null
}

/** Today's entries on the club's own places, by start, the first `limit` of them and the count of the rest. */
export function todayAtFacility<E extends TodayEntry>(
  calendar: { places: readonly TodayPlace[]; entries: readonly E[] },
  limit: number = TODAY_AT_FACILITY_SHOWN,
): TodayAtFacility<E> {
  const own = new Set(calendar.places.filter((place) => !place.isExternal).map((place) => place.id))
  const today = calendar.entries
    .filter((entry) => own.has(entry.placeId))
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
  const shown = today.slice(0, Math.max(0, limit))
  return { shown, more: today.length - shown.length, firstPlaceId: shown[0]?.placeId ?? null }
}
