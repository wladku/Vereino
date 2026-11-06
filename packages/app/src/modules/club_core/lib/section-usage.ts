// The section rules of the UX parity spec (`.ai/specs/implemented/2026-11-03-vereino-ux-parity-phases-1-3.md`, REQ-U02):
// the deactivation guard (DD-U04, DD-U08) — deactivating or deleting a live section is refused
// while the section has active groups, listing at most `SECTION_USAGE_LIST_LIMIT` of them plus the total — and the
// section name rule (DD-U07): 2–80 characters on create and when the submitted name differs from the stored one, so
// a stored longer name keeps saving unchanged.

/** At most this many active groups are listed in a 409 `section_has_active_groups`. */
export const SECTION_USAGE_LIST_LIMIT = 20

export const SECTION_NAME_MIN = 2
export const SECTION_NAME_MAX = 80

/** The active groups of a section as `groups.sectionUsage` answers them. */
export type SectionUsage = { groups: { id: string; name: string }[]; total: number }

/** The state of a section the guard compares: active or not, live or soft-deleted. */
export type SectionState = { isActive: boolean; deleted: boolean }

/**
 * True when a write must check the section's active groups first: any delete of a live section (whatever its state,
 * so a section deactivated before the guard existed cannot be deleted under live groups) and any deactivation of a
 * live active section. Activating, restoring and saving an unchanged state need no check.
 */
export function needsUsageGuard(current: SectionState, next: SectionState): boolean {
  if (next.deleted) return !current.deleted
  return current.isActive && !current.deleted && !next.isActive
}

/** The 409 details when the section is in use, else null: at most the list limit of groups, and the total. */
export function sectionUsageConflict(usage: SectionUsage | null): SectionUsage | null {
  if (!usage || usage.total <= 0) return null
  return { groups: usage.groups.slice(0, SECTION_USAGE_LIST_LIMIT), total: usage.total }
}

/**
 * The name rule of a section write: `section_name_length` when a new or changed name (trimmed) is outside 2–80,
 * else null. `stored` is null on create; an unchanged stored name is accepted whatever its length.
 */
export function sectionNameProblem(submitted: string, stored: string | null): 'section_name_length' | null {
  const name = submitted.trim()
  if (stored !== null && name === stored) return null
  return name.length < SECTION_NAME_MIN || name.length > SECTION_NAME_MAX ? 'section_name_length' : null
}
