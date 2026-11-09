import { describe, expect, it } from '@jest/globals'
import {
  clubPagePreview,
  DEFAULT_PUBLICATION,
  PUBLICATION_BLOCKS,
  applyPublicationPatch,
  clubPublicationProblem,
  isBlockPublished,
  isPublicLinkUrl,
  isPublicSlug,
  PUBLIC_LINK_MAX_LENGTH,
  publicLinkUrlSchema,
  publicSlugSchema,
  publicationPatchSchema,
  publishedBlocks,
  resolvePublication,
  placePublicationProblem,
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

  it('requires a slug for a place with a public calendar (#124)', () => {
    expect(placePublicationProblem({ isPublicSchedule: true, publicSlug: null })).toBe('place_public_slug_required')
    expect(placePublicationProblem({ isPublicSchedule: true, publicSlug: 'orlik' })).toBeNull()
    expect(placePublicationProblem({ isPublicSchedule: false, publicSlug: null })).toBeNull()
  })
})

describe('footer links (#195)', () => {
  it('accepts an absolute http or https URL with a host', () => {
    expect(isPublicLinkUrl('https://club.example/rules.pdf')).toBe(true)
    expect(isPublicLinkUrl('http://club.example/privacy?lang=pl#top')).toBe(true)
  })

  it('refuses other schemes, relative or malformed addresses, surrounding spaces and overlong URLs', () => {
    expect(isPublicLinkUrl('javascript:alert(1)')).toBe(false)
    expect(isPublicLinkUrl('mailto:club@example.org')).toBe(false)
    expect(isPublicLinkUrl('file:///etc/passwd')).toBe(false)
    expect(isPublicLinkUrl('/rules')).toBe(false)
    expect(isPublicLinkUrl('club.example/rules')).toBe(false)
    expect(isPublicLinkUrl(' https://club.example/rules')).toBe(false)
    const long = `https://club.example/${'a'.repeat(PUBLIC_LINK_MAX_LENGTH)}`
    expect(isPublicLinkUrl(long)).toBe(false)
  })

  it('trims the input before checking it', () => {
    expect(publicLinkUrlSchema.parse('  https://club.example/rules  ')).toBe('https://club.example/rules')
    expect(publicLinkUrlSchema.safeParse('ftp://club.example/rules').success).toBe(false)
  })
})

describe('club page preview (#87)', () => {
  it('shows the address always and disables Preview with a reason', () => {
    expect(clubPagePreview({ enabled: true, publicSlug: 'dev-academy' })).toEqual({
      path: '/p/dev-academy',
      href: '/p/dev-academy',
      disabledReason: null,
    })
    expect(clubPagePreview({ enabled: false, publicSlug: 'dev-academy' })).toEqual({
      path: '/p/dev-academy',
      href: null,
      disabledReason: 'page_off',
    })
    expect(clubPagePreview({ enabled: true, publicSlug: null })).toEqual({
      path: null,
      href: null,
      disabledReason: 'slug_missing',
    })
  })
})
