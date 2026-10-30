// Pure rules of the place hierarchy (club spec glossary *Place*): the kinds, the cycle check, the leaf rule for
// sessions and bookings, and the place contacts, which are stored encrypted as one JSON text.
import { z } from 'zod'

/** Kinds of a place node: a complex groups the others (club spec glossary *Place*). */
export const PLACE_KINDS = ['complex', 'pitch', 'multi_pitch', 'hall', 'locker_room', 'pool', 'other'] as const
export type PlaceKind = (typeof PLACE_KINDS)[number]

/**
 * True when making `parentId` the parent of `placeId` closes a cycle: the parent is the place itself or one of its
 * descendants. `parentOf` maps each place id of the organization to its current parent id (null for a root). A
 * loop already present in `parentOf` also answers true, so a corrupt hierarchy is never extended.
 */
export function wouldCreateCycle(
  placeId: string,
  parentId: string | null,
  parentOf: ReadonlyMap<string, string | null>,
): boolean {
  const visited = new Set<string>()
  for (let current = parentId; current !== null; current = parentOf.get(current) ?? null) {
    if (current === placeId || visited.has(current)) return true
    visited.add(current)
  }
  return false
}

/**
 * The ancestors and descendants of a place (club spec glossary *Session conflict*: a session occupies its place, the
 * place's ancestors and its descendants). `parentOf` maps each place id to its parent (null for a root); a loop in a
 * corrupt hierarchy is walked once and never repeated. The place itself is in neither list.
 */
export function placeRelatives(
  placeId: string,
  parentOf: ReadonlyMap<string, string | null>,
): { ancestorIds: string[]; descendantIds: string[] } {
  const ancestorIds: string[] = []
  for (let current = parentOf.get(placeId) ?? null; current !== null; current = parentOf.get(current) ?? null) {
    if (current === placeId || ancestorIds.includes(current)) break
    ancestorIds.push(current)
  }
  const childrenOf = new Map<string, string[]>()
  for (const [id, parent] of parentOf) {
    if (parent !== null) childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), id])
  }
  const descendantIds: string[] = []
  const pending = [...(childrenOf.get(placeId) ?? [])]
  for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
    // Every place has one parent, so a place is reached at most once — except the place itself in a corrupt loop.
    if (next === placeId) continue
    descendantIds.push(next)
    pending.push(...(childrenOf.get(next) ?? []))
  }
  return { ancestorIds, descendantIds: descendantIds.sort() }
}

/** Why a place cannot take a session or a booking. */
export type BookablePlaceProblem = 'not_found' | 'has_children'

/**
 * Sessions and bookings point to a leaf: a place with children (a complex with its pitches, hall and pool) is
 * refused; a complex without children is a leaf. `place` is null when the place does not exist in the club.
 */
export function bookablePlaceProblem(place: { childCount: number } | null): BookablePlaceProblem | null {
  if (!place) return 'not_found'
  return place.childCount > 0 ? 'has_children' : null
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null))

/** One contact of a place (e.g. the caretaker): `{ role, name, phone }` (club spec *Data Models* → `contacts`). */
export const placeContactSchema = z
  .object({
    role: optionalText(100),
    name: z.string().trim().min(1).max(200),
    phone: optionalText(50),
  })
  .strict()

export const placeContactsSchema = z.array(placeContactSchema).max(20)

export type PlaceContact = z.output<typeof placeContactSchema>

/** The stored text of the contacts: null for none, so clearing the list clears the column. */
export function serializePlaceContacts(contacts: readonly PlaceContact[] | null | undefined): string | null {
  return contacts && contacts.length > 0 ? JSON.stringify(contacts) : null
}

/**
 * The contacts of a stored (decrypted) value: the JSON text written by `serializePlaceContacts`, or an already
 * parsed array. Anything unreadable yields an empty list rather than failing the read.
 */
export function parsePlaceContacts(stored: unknown): PlaceContact[] {
  let value: unknown = stored
  if (typeof stored === 'string') {
    try {
      value = JSON.parse(stored) as unknown
    } catch {
      return []
    }
  }
  const parsed = placeContactsSchema.safeParse(value)
  return parsed.success ? parsed.data : []
}

/** A stored decimal (string from the driver) or number as a number; null for an empty or invalid value. */
export function decimalOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
