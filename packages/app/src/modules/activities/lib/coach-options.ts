// The options of the coach picker (README B-14, #93): the persons who may coach, filtered by what the coordinator types
// and sorted by last name. Names arrive decrypted from `people`, so the search runs here rather than in SQL. Pure.

export type CoachCandidate = { id: string; firstName: string; lastName: string }
export type CoachOption = { id: string; name: string }

/** The most options one answer holds; a club rarely has more coaches, and typing narrows the list. */
export const MAX_COACH_OPTIONS = 50

/** Lower case without diacritics, so "lukasz" finds "Łukasz". */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
}

/** Every word of `search` is the start of the first or the last name; a blank search keeps everyone. */
function matches(candidate: CoachCandidate, words: readonly string[]): boolean {
  const names = [candidate.firstName, candidate.lastName].map(foldForSearch)
  return words.every((word) => names.some((name) => name.startsWith(word)))
}

export function coachOptions(
  candidates: readonly CoachCandidate[],
  search: string | null | undefined,
  limit: number = MAX_COACH_OPTIONS,
): CoachOption[] {
  const words = foldForSearch(search ?? '')
    .split(/\s+/)
    .filter((word) => word.length > 0)
  return candidates
    .filter((candidate) => matches(candidate, words))
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'pl') ||
        a.firstName.localeCompare(b.firstName, 'pl') ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map((candidate) => ({ id: candidate.id, name: `${candidate.firstName} ${candidate.lastName}` }))
}
