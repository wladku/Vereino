import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_PUBLICATION,
  PUBLICATION_BLOCKS,
  applyPublicationPatch,
  clubPublicationProblem,
  isBlockPublished,
  isPublicSlug,
  publicSlugSchema,
  publicationPatchSchema,
  publishedBlocks,
  resolvePublication,
  sectionPublicationProblem,
  type Publication,
} from '../publication'

const allOff = DEFAULT_PUBLICATION.blocks

describe('publication blocks', () => {
  it('lists the blocks of the glossary, every one off by default and the page off', () => {
    expect(PUBLICATION_BLOCKS).toEqual([
      'description_schedule',
      'conditions',
      'prices',
      'coaches',
      'materials',
      'contact',
      'places_calendar',
      'online_requests',
    ])
    expect(DEFAULT_PUBLICATION.enabled).toBe(false)
    expect(Object.values(allOff).every((value) => !value)).toBe(true)
  })

  it('resolves a stored value: missing blocks are off, unknown keys are ignored', () => {
    expect(resolvePublication({ enabled: true, blocks: { contact: true, legacy: true } })).toEqual({
      enabled: true,
      blocks: { ...allOff, contact: true },
    })
  })

  it('publishes nothing for an invalid or missing stored value', () => {
    for (const stored of [null, undefined, 'yes', { enabled: 'yes', blocks: {} }, { enabled: true }]) {
      expect(resolvePublication(stored)).toEqual({ enabled: false, blocks: allOff })
    }
    expect(resolvePublication({ enabled: true, blocks: { conditions: 'on' } })).toEqual({
      enabled: false,
      blocks: allOff,
    })
  })

  it('applies a partial patch and keeps what it does not name', () => {
    const current: Publication = { enabled: true, blocks: { ...allOff, conditions: true } }
    expect(applyPublicationPatch(current, { blocks: { materials: true } })).toEqual({
      enabled: true,
      blocks: { ...allOff, conditions: true, materials: true },
    })
    expect(applyPublicationPatch(current, { enabled: false })).toEqual({ ...current, enabled: false })
    expect(applyPublicationPatch(current, undefined)).toEqual(current)
  })

  it('rejects unknown blocks and keys in a patch', () => {
    expect(publicationPatchSchema.safeParse({ blocks: { contact: true } }).success).toBe(true)
    expect(publicationPatchSchema.safeParse({ blocks: { gallery: true } }).success).toBe(false)
    expect(publicationPatchSchema.safeParse({ enabled: true, tenantId: 'x' }).success).toBe(false)
  })

  it('publishes a block only while the page is on', () => {
    const on: Publication = { enabled: true, blocks: { ...allOff, contact: true, materials: true } }
    expect(isBlockPublished(on, 'contact')).toBe(true)
    expect(isBlockPublished(on, 'prices')).toBe(false)
    expect(isBlockPublished({ ...on, enabled: false }, 'contact')).toBe(false)
    expect(publishedBlocks(on)).toEqual(['materials', 'contact'])
    expect(publishedBlocks({ ...on, enabled: false })).toEqual([])
  })
})

describe('public slugs', () => {
  it('accepts lower-case letters, digits and single hyphens, 3–60 characters, after trimming and lower-casing', () => {
    expect(publicSlugSchema.parse('  Dev-Academy ')).toBe('dev-academy')
    expect(publicSlugSchema.parse('basen2')).toBe('basen2')
    expect(publicSlugSchema.parse('a'.repeat(60))).toBe('a'.repeat(60))
  })

  it('refuses other characters, double or edge hyphens and the wrong length', () => {
    for (const value of [
      'ab',
      'a'.repeat(61),
      'dev academy',
      'dev--academy',
      '-dev',
      'dev-',
      'zażółć',
      'dev_academy',
    ]) {
      expect(publicSlugSchema.safeParse(value).success).toBe(false)
    }
  })

  it('checks a stored slug without normalizing it', () => {
    expect(isPublicSlug('dev-academy')).toBe(true)
    expect(isPublicSlug('Dev-Academy')).toBe(false)
    expect(isPublicSlug('ab')).toBe(false)
    expect(isPublicSlug('a'.repeat(61))).toBe(false)
  })

  it('needs the club slug for a published page and the section slug for a public section', () => {
    const on: Publication = { enabled: true, blocks: allOff }
    expect(clubPublicationProblem({ publication: on, publicSlug: null })).toBe('publication_slug_required')
    expect(clubPublicationProblem({ publication: on, publicSlug: 'dev-academy' })).toBeNull()
    expect(clubPublicationProblem({ publication: { ...on, enabled: false }, publicSlug: null })).toBeNull()
    expect(sectionPublicationProblem({ isPublic: true, publicSlug: null })).toBe('section_public_slug_required')
    expect(sectionPublicationProblem({ isPublic: true, publicSlug: 'basen' })).toBeNull()
    expect(sectionPublicationProblem({ isPublic: false, publicSlug: null })).toBeNull()
  })
})
