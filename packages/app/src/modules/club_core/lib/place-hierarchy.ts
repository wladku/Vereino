// Pure rules of the places list (E06-S04 #86; README B-06, UX parity spec phase 3): the list state kept in the page
// URL — the kind, parent and active filters and the search — and the parent-first order of one page of places, which
// the name cell shows as an indented hierarchy. Nothing here reads the database.
import { PLACE_KINDS, type PlaceKind } from './places'

/** The list state a places URL carries; an absent key is "no filter". */
export type PlaceListState = {
  readonly kind?: PlaceKind
  readonly parentPlaceId?: string
  readonly isActive?: 'true' | 'false'
  readonly search?: string
}

/** The keys of the state, in the order a URL writes them. */
const STATE_KEYS = ['kind', 'parentPlaceId', 'isActive', 'search'] as const

const MAX_TEXT = 200

function isKind(value: string): value is PlaceKind {
  return (PLACE_KINDS as readonly string[]).includes(value)
}

function text(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 && trimmed.length <= MAX_TEXT ? trimmed : undefined
}

/**
 * The list state of a URL's query (`?kind=pitch&parentPlaceId=…`). Unknown kinds and statuses and blank or over-long
 * values are dropped, so a hand-edited URL never sends a request the list API would refuse; the parent id is passed
 * as given (the API validates it).
 */
export function parsePlaceListState(query: { get(key: string): string | null }): PlaceListState {
  const kind = query.get('kind')
  const isActive = query.get('isActive')
  const state: { -readonly [key in keyof PlaceListState]: PlaceListState[key] } = {}
  if (kind && isKind(kind)) state.kind = kind
  const parentPlaceId = text(query.get('parentPlaceId'))
  if (parentPlaceId) state.parentPlaceId = parentPlaceId
  if (isActive === 'true' || isActive === 'false') state.isActive = isActive
  const search = text(query.get('search'))
  if (search) state.search = search
  return state
}

/** The query string of a list state (no leading `?`; empty when no filter is set), in a stable key order. */
export function placeListQuery(state: PlaceListState): string {
  const params = new URLSearchParams()
  for (const key of STATE_KEYS) {
    const value = state[key]
    if (value) params.set(key, value)
  }
  return params.toString()
}

/** Whether any filter or search narrows the list (the empty state then offers "Clear filters", not "Add place"). */
export function hasPlaceFilters(state: PlaceListState): boolean {
  return STATE_KEYS.some((key) => Boolean(state[key]))
}

/** A place of one list page as the hierarchy order reads it. */
export type HierarchyPlace = {
  readonly id: string
  readonly parentPlaceId: string | null
  readonly name: string | null
}

export type HierarchyRow<T extends HierarchyPlace> = {
  readonly place: T
  /** 0 for a top-level place and for a place whose parent is not on the page; one more per ancestor on the page. */
  readonly depth: number
  /** True when the place has a parent that is not on this page (the name cell then names the parent). */
  readonly parentElsewhere: boolean
}

/** By name (Polish letters in place), then by id, so places of the same name keep one stable order. */
function byName(a: HierarchyPlace, b: HierarchyPlace): number {
  return (a.name ?? '').localeCompare(b.name ?? '', 'pl') || (a.id < b.id ? -1 : 1)
}

/**
 * One page of places ordered parent first (UX parity spec, B-06 behavior): each place is followed by its children on
 * the page, by name, at one more level of depth. A place whose parent is not on the page — a filtered list, another
 * page, a deleted parent — starts its own branch at depth 0 and is marked `parentElsewhere`. A loop in a corrupt
 * hierarchy is broken where it is entered, so every place is listed exactly once.
 */
export function orderParentFirst<T extends HierarchyPlace>(places: readonly T[]): HierarchyRow<T>[] {
  const onPage = new Set(places.map((place) => place.id))
  const childrenOf = new Map<string, T[]>()
  const roots: T[] = []
  for (const place of places) {
    const parent = place.parentPlaceId
    if (parent !== null && parent !== place.id && onPage.has(parent)) {
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), place])
    } else {
      roots.push(place)
    }
  }
  const rows: HierarchyRow<T>[] = []
  const listed = new Set<string>()
  const visit = (place: T, depth: number, parentElsewhere: boolean) => {
    listed.add(place.id)
    rows.push({ place, depth, parentElsewhere })
    for (const child of [...(childrenOf.get(place.id) ?? [])].sort(byName)) {
      if (!listed.has(child.id)) visit(child, depth + 1, false)
    }
  }
  for (const root of [...roots].sort(byName)) {
    visit(root, 0, root.parentPlaceId !== null)
  }
  // Places of a loop (each one's parent is on the page) are never reached from a root: list each loop from its first
  // place by name, as if that place's parent were elsewhere.
  for (const place of [...places].sort(byName)) {
    if (!listed.has(place.id)) visit(place, 0, true)
  }
  return rows
}
