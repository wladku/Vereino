// Publication of the club page (club spec glossary *Publication*, DD-23, DD-28, DD-29; REQ-025): the club's
// `publication` setting — the page switch and one switch per block, every one off by default — and the public slugs
// of the club and its sections. Pure: the stored jsonb is passed in; an invalid stored value falls back to "nothing
// published", so a damaged setting never publishes a block.
import { z } from 'zod'

/** The blocks a club enables (glossary *Publication*: terms = `conditions`, instructors = `coaches`). */
export const PUBLICATION_BLOCKS = [
  'description_schedule',
  'conditions',
  'prices',
  'coaches',
  'materials',
  'contact',
  'places_calendar',
  'online_requests',
] as const
export type PublicationBlock = (typeof PUBLICATION_BLOCKS)[number]

export type PublicationBlocks = Record<PublicationBlock, boolean>

export type Publication = { enabled: boolean; blocks: PublicationBlocks }

export const DEFAULT_PUBLICATION: Readonly<Publication> = {
  enabled: false,
  blocks: {
    description_schedule: false,
    conditions: false,
    prices: false,
    coaches: false,
    materials: false,
    contact: false,
    places_calendar: false,
    online_requests: false,
  },
}

const blockSwitches = Object.fromEntries(PUBLICATION_BLOCKS.map((block) => [block, z.boolean()])) as Record<
  PublicationBlock,
  z.ZodBoolean
>

/** A partial update: the page switch and any subset of the blocks; unknown blocks are rejected. */
export const publicationPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    blocks: z.object(blockSwitches).partial().strict().optional(),
  })
  .strict()

export type PublicationPatch = z.output<typeof publicationPatchSchema>

const storedPublicationSchema = z.object({
  enabled: z.boolean(),
  blocks: z.object(blockSwitches).partial().loose(),
})

/** The effective publication of a stored value: missing blocks are off; an invalid value publishes nothing. */
export function resolvePublication(stored: unknown): Publication {
  const parsed = storedPublicationSchema.safeParse(stored)
  if (!parsed.success) return { enabled: false, blocks: { ...DEFAULT_PUBLICATION.blocks } }
  const blocks = { ...DEFAULT_PUBLICATION.blocks }
  for (const block of PUBLICATION_BLOCKS) blocks[block] = parsed.data.blocks[block] === true
  return { enabled: parsed.data.enabled, blocks }
}

/** The publication after a partial update: absent keys keep their value. */
export function applyPublicationPatch(current: Publication, patch: PublicationPatch | undefined): Publication {
  return {
    enabled: patch?.enabled ?? current.enabled,
    blocks: { ...current.blocks, ...patch?.blocks },
  }
}

/** True when the club publishes its page and the block. */
export function isBlockPublished(publication: Publication, block: PublicationBlock): boolean {
  return publication.enabled && publication.blocks[block]
}

/** The blocks a published page shows, in catalogue order; none while the page is off. */
export function publishedBlocks(publication: Publication): PublicationBlock[] {
  return PUBLICATION_BLOCKS.filter((block) => isBlockPublished(publication, block))
}

export const PUBLIC_SLUG_MIN_LENGTH = 3
export const PUBLIC_SLUG_MAX_LENGTH = 60
const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * A public slug (DD-23): lower-case letters a–z, digits and single hyphens between them, 3–60 characters; readable
 * on a notice board and in a QR code. Input is trimmed and lower-cased first; anything else is refused.
 */
export const publicSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(PUBLIC_SLUG_MIN_LENGTH)
  .max(PUBLIC_SLUG_MAX_LENGTH)
  .regex(PUBLIC_SLUG_PATTERN, { message: 'Use lower-case letters, digits and single hyphens' })

/** True when `value` is a well-formed public slug as stored (no normalization). */
export function isPublicSlug(value: string): boolean {
  return (
    value.length >= PUBLIC_SLUG_MIN_LENGTH && value.length <= PUBLIC_SLUG_MAX_LENGTH && PUBLIC_SLUG_PATTERN.test(value)
  )
}

/** Why a club's publication cannot be saved: an enabled page needs the club's public slug. */
export function clubPublicationProblem(input: {
  publication: Publication
  publicSlug: string | null
}): 'publication_slug_required' | null {
  return input.publication.enabled && !input.publicSlug ? 'publication_slug_required' : null
}

/** Why a section's public fields cannot be saved: a public section needs its own slug (glossary *Section*). */
export function sectionPublicationProblem(input: {
  isPublic: boolean
  publicSlug: string | null
}): 'section_public_slug_required' | null {
  return input.isPublic && !input.publicSlug ? 'section_public_slug_required' : null
}
