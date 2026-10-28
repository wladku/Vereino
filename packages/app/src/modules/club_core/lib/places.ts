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
