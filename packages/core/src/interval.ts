// P-26 overlap maths (foundation II DD-G05): half-open time intervals keyed by a resource (a place, a coach) and the
// conflicts of candidate intervals against the existing ones, measured against the resource's capacity. The caller
// builds the intervals — `activities` re-keys the sessions of a place's ancestors and descendants to the candidate
// place and adds the coach's own sessions keyed by the coach — so this file knows neither places nor coaches.

/** A half-open interval `[start, end)` on one resource. */
export type Interval = {
  readonly id: string
  readonly resourceId: string
  readonly start: Date
  readonly end: Date
}

/** One candidate that would exceed its resource's capacity, with every existing interval it overlaps. */
export type Conflict = {
  readonly candidateId: string
  readonly resourceId: string
  readonly conflictingIds: readonly string[]
}

/** Half-open overlap: a session ending at 18:00 does not overlap one starting at 18:00. */
export function intervalsOverlap(a: Pick<Interval, 'start' | 'end'>, b: Pick<Interval, 'start' | 'end'>): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()
}

/** The largest number of `intervals` in use at the same instant inside `window`. */
function peakUse(window: Pick<Interval, 'start' | 'end'>, intervals: readonly Interval[]): number {
  const edges: Array<{ at: number; delta: number }> = []
  for (const interval of intervals) {
    edges.push({ at: Math.max(interval.start.getTime(), window.start.getTime()), delta: 1 })
    edges.push({ at: Math.min(interval.end.getTime(), window.end.getTime()), delta: -1 })
  }
  // At the same instant an interval ends before another starts (half-open).
  edges.sort((a, b) => a.at - b.at || a.delta - b.delta)
  let current = 0
  let peak = 0
  for (const edge of edges) {
    current += edge.delta
    peak = Math.max(peak, current)
  }
  return peak
}

/**
 * The candidates that, together with the existing intervals of their resource, would put more intervals in use at
 * one instant than `capacityOf(resourceId)` allows (a capacity below 1 counts as 1). Existing intervals with a
 * candidate's own id are ignored (a session compared with its stored self). Conflicts are returned in candidate
 * order; each lists the overlapping existing ids, sorted.
 */
export function findOverlaps(
  candidates: readonly Interval[],
  existing: readonly Interval[],
  capacityOf: (resourceId: string) => number,
): Conflict[] {
  const conflicts: Conflict[] = []
  for (const candidate of candidates) {
    const overlapping = existing.filter(
      (interval) =>
        interval.resourceId === candidate.resourceId &&
        interval.id !== candidate.id &&
        intervalsOverlap(interval, candidate),
    )
    if (overlapping.length === 0) continue
    const capacity = Math.max(1, capacityOf(candidate.resourceId))
    if (peakUse(candidate, overlapping) + 1 <= capacity) continue
    conflicts.push({
      candidateId: candidate.id,
      resourceId: candidate.resourceId,
      conflictingIds: [...new Set(overlapping.map((interval) => interval.id))].sort(),
    })
  }
  return conflicts
}
