// The `groups.publicCatalog` block of a public section page (club spec DD-28, DD-29, REQ-025; #91): one card per
// public group — its name, age range, level and public description, its requirements only with the club's
// `conditions` block, and its instructors only with the `coaches` block, each named "First L." with that person's
// consent and anonymous ("Section coach") without it. Pure: the service passes the rows, the published blocks and the
// consented names; nothing here reads the database.

/** A public group as the service reads it. */
export type PublicGroupRow = {
  id: string
  name: string
  /** A team names its leader "coach", a class group "instructor" (club spec glossary *Coach / instructor*). */
  kind: string
  publicDescription: string | null
  publicConditions: string | null
  ageFrom: number | null
  ageTo: number | null
  levelLabel: string | null
}

/** An instructor of a card: the consented public name, or null (the page says "Section coach"). */
export type PublicInstructor = { name: string | null }

export type PublicGroupCard = {
  id: string
  name: string
  kind: string
  description: string | null
  ageFrom: number | null
  ageTo: number | null
  level: string | null
  /** Only with the `conditions` block. */
  conditions?: string | null
  /** Only with the `coaches` block; never a name without consent. */
  instructors?: PublicInstructor[]
}

export type PublicCatalogBlock = { items: PublicGroupCard[] }

const filled = (value: string | null): string | null => (value !== null && value.trim() !== '' ? value : null)

/**
 * The catalogue block, or null when the section has no public group (the block is then left out of the page). The
 * rows keep their order; `coachIds` lists each group's leading persons (coaches first), `publicNames` holds only the
 * names of persons who consented.
 */
export function publicCatalogBlock(
  rows: readonly PublicGroupRow[],
  blocks: { conditions: boolean; coaches: boolean },
  coachIds: ReadonlyMap<string, readonly string[]>,
  publicNames: ReadonlyMap<string, string>,
): PublicCatalogBlock | null {
  if (rows.length === 0) return null
  return {
    items: rows.map((row) => {
      const card: PublicGroupCard = {
        id: row.id,
        name: row.name,
        kind: row.kind,
        description: filled(row.publicDescription),
        ageFrom: row.ageFrom,
        ageTo: row.ageTo,
        level: filled(row.levelLabel),
      }
      if (blocks.conditions) card.conditions = filled(row.publicConditions)
      if (blocks.coaches) {
        card.instructors = (coachIds.get(row.id) ?? []).map((personId) => ({ name: publicNames.get(personId) ?? null }))
      }
      return card
    }),
  }
}

/** The club page's `groups` block (E06-S07, #89): the number of public groups per public section, by its slug. */
export type PublicGroupCountsBlock = { counts: Record<string, number> }

/**
 * The tile counts of the club page, or null when no public section has a public group (the block is then left out).
 * `groupSectionIds` holds the section id of each public group; groups of a section not in `sections` are ignored, and
 * a section without public groups gets no count.
 */
export function publicGroupCounts(
  sections: readonly { id: string; slug: string }[],
  groupSectionIds: readonly string[],
): PublicGroupCountsBlock | null {
  const slugs = new Map(sections.map((section) => [section.id, section.slug]))
  const counts: Record<string, number> = {}
  for (const sectionId of groupSectionIds) {
    const slug = slugs.get(sectionId)
    if (slug !== undefined) counts[slug] = (counts[slug] ?? 0) + 1
  }
  return Object.keys(counts).length > 0 ? { counts } : null
}
