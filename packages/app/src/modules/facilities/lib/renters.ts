// The renter search of the slot dialog (facilities parity spec DD-R07, the `GET /api/facilities/renters` row of *API*;
// REQ-R14; #277), pure: the search term, the name match and the merge of the three sources into at most 20 options —
// the renters of earlier rentals on the caller's places (most recent first, with the category and the contact of their
// last rental), the club's institutions by name, and, only for a caller with `people.view`, persons by name. The
// service reads the sources inside the caller's scope; nothing here reads a record.
import type { RenterType } from './rentals'

/** The length of a search term (`search`, 2–80 characters after trimming). */
export const RENTER_SEARCH_MIN = 2
export const RENTER_SEARCH_MAX = 80

/** The most options one search returns. */
export const RENTER_RESULTS_MAX = 20

/** The most rental rows one search reads (Security: *Size*). */
export const RENTER_HISTORY_ROWS = 500

/** How far back the rental history reaches. */
export const RENTER_HISTORY_MONTHS = 24

/** A term folded for matching: lower case, without diacritics, single spaces. */
export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether `name` contains every word of `query`, case- and diacritic-insensitive. */
export function renterNameMatches(name: string | null | undefined, query: string): boolean {
  if (!name) return false
  const folded = foldSearchText(name)
  const words = foldSearchText(query).split(' ').filter(Boolean)
  return words.length > 0 && words.every((word) => folded.includes(word))
}

/** The first instant of the rental history at `now`: the same day `RENTER_HISTORY_MONTHS` months back. */
export function renterHistoryStart(now: Date): Date {
  const start = new Date(now.getTime())
  start.setUTCMonth(start.getUTCMonth() - RENTER_HISTORY_MONTHS)
  return start
}

export type RenterContact = { name: string | null; phone: string | null; email: string | null }

/** One option of the renter search. */
export type RenterOption = {
  renterType: RenterType
  /** Null for a renter not in the register (`unregistered`). */
  renterId: string | null
  displayName: string
  lastCategory: string | null
  lastContact: RenterContact | null
}

/** A rental of the history as the merge reads it (decrypted by the service). */
export type RenterHistoryRow = {
  renterType: RenterType
  renterId: string | null
  renterDisplayName: string | null
  renterCategory: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  startsAt: Date
}

export type RenterSources = {
  history: readonly RenterHistoryRow[]
  institutions: ReadonlyArray<{ id: string; name: string }>
  /** Empty for a caller without `people.view` (the service never reads them for such a caller). */
  persons: ReadonlyArray<{ id: string; name: string }>
}

function keyOf(renterType: RenterType, renterId: string | null, displayName: string): string {
  return renterId ? `${renterType}:${renterId}` : `${renterType}:${foldSearchText(displayName)}`
}

function contactOf(row: RenterHistoryRow): RenterContact | null {
  if (!row.contactName && !row.contactPhone && !row.contactEmail) return null
  return { name: row.contactName, phone: row.contactPhone, email: row.contactEmail }
}

function byName(a: { name: string; id: string }, b: { name: string; id: string }): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}

/**
 * The options for `query`: first the renters of the history whose name matches, the most recent rental first, each
 * once with its last category and contact; then the matching institutions by name, then the matching persons by name,
 * each unless the history already listed it; at most `RENTER_RESULTS_MAX`.
 */
export function mergeRenterOptions(sources: RenterSources, query: string): RenterOption[] {
  const options = new Map<string, RenterOption>()
  const history = [...sources.history].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
  for (const row of history) {
    const displayName = row.renterDisplayName?.trim()
    if (!displayName || !renterNameMatches(displayName, query)) continue
    const renterId = row.renterType === 'unregistered' ? null : row.renterId
    const key = keyOf(row.renterType, renterId, displayName)
    if (options.has(key)) continue
    options.set(key, {
      renterType: row.renterType,
      renterId,
      displayName,
      lastCategory: row.renterCategory,
      lastContact: contactOf(row),
    })
  }
  const registered = (renterType: 'institution' | 'person', list: ReadonlyArray<{ id: string; name: string }>) => {
    for (const entry of [...list].sort(byName)) {
      if (!renterNameMatches(entry.name, query)) continue
      const key = keyOf(renterType, entry.id, entry.name)
      if (options.has(key)) continue
      options.set(key, {
        renterType,
        renterId: entry.id,
        displayName: entry.name,
        lastCategory: null,
        lastContact: null,
      })
    }
  }
  registered('institution', sources.institutions)
  registered('person', sources.persons)
  return [...options.values()].slice(0, RENTER_RESULTS_MAX)
}
