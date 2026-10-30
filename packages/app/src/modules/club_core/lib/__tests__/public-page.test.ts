import { describe, expect, it } from '@jest/globals'
import {
  CLUB_CORE_BLOCK_KEYS,
  clubContact,
  isMaterialPublished,
  providerMayContribute,
  sectionBlocks,
  type SectionMaterialRow,
  type SectionPublicContent,
} from '../public-page'
import { DEFAULT_PUBLICATION, type Publication } from '../publication'

const everything: Publication = {
  enabled: true,
  blocks: {
    description_schedule: true,
    conditions: true,
    prices: true,
    coaches: true,
    materials: true,
    contact: true,
    places_calendar: true,
    online_requests: true,
  },
}

const content: SectionPublicContent = {
  publicDescription: 'Swimming lessons for children.',
  publicConditions: 'Swimsuit, cap, declaration.',
  publicContactName: 'Section coordinator',
  publicContactEmail: 'basen@example.org',
  publicContactPhone: '+48 600 000 000',
}

const materials: SectionMaterialRow[] = [
  {
    id: 'm1',
    title: 'Regulations',
    fileName: 'regulamin.pdf',
    mimeType: 'application/pdf',
    fileSize: 1000,
    isPublic: true,
  },
  {
    id: 'm2',
    title: 'Internal notes',
    fileName: 'notes.pdf',
    mimeType: 'application/pdf',
    fileSize: 10,
    isPublic: false,
  },
]

const url = (id: string) => `/files/${id}`

describe('section blocks of club_core', () => {
  it('returns every enabled block with its content, and only the public materials', () => {
    expect(sectionBlocks(everything, content, materials, url)).toEqual({
      description: { text: 'Swimming lessons for children.' },
      conditions: { text: 'Swimsuit, cap, declaration.' },
      materials: {
        items: [
          {
            id: 'm1',
            title: 'Regulations',
            fileName: 'regulamin.pdf',
            mimeType: 'application/pdf',
            fileSize: 1000,
            url: '/files/m1',
          },
        ],
      },
      contact: { name: 'Section coordinator', email: 'basen@example.org', phone: '+48 600 000 000' },
    })
  })

  it('leaves a disabled block out of the result (not just empty)', () => {
    const onlyContact: Publication = { enabled: true, blocks: { ...DEFAULT_PUBLICATION.blocks, contact: true } }
    const blocks = sectionBlocks(onlyContact, content, materials, url)
    expect(Object.keys(blocks)).toEqual(['contact'])
  })

  it('leaves everything out while the page is off', () => {
    expect(sectionBlocks({ ...everything, enabled: false }, content, materials, url)).toEqual({})
  })

  it('leaves an enabled block with nothing to show out, and keeps a partial contact', () => {
    const empty: SectionPublicContent = {
      publicDescription: '  ',
      publicConditions: null,
      publicContactName: null,
      publicContactEmail: '',
      publicContactPhone: null,
    }
    expect(sectionBlocks(everything, empty, [materials[1]], url)).toEqual({})
    expect(sectionBlocks(everything, { ...empty, publicContactPhone: '123' }, [], url)).toEqual({
      contact: { name: null, email: null, phone: '123' },
    })
    expect(sectionBlocks(everything, { ...empty, publicContactEmail: 'a@b.c' }, [], url)).toEqual({
      contact: { name: null, email: 'a@b.c', phone: null },
    })
  })

  it('shows the club phone only with the contact block', () => {
    expect(clubContact(everything, '+48 22 000 00 00')).toEqual({ phone: '+48 22 000 00 00' })
    expect(clubContact(everything, null)).toBeNull()
    expect(clubContact({ ...everything, blocks: { ...everything.blocks, contact: false } }, '1')).toBeNull()
  })

  it('publishes a material only when it is public and the materials block is on', () => {
    expect(isMaterialPublished(everything, { isPublic: true })).toBe(true)
    expect(isMaterialPublished(everything, { isPublic: false })).toBe(false)
    expect(isMaterialPublished({ ...everything, enabled: false }, { isPublic: true })).toBe(false)
  })
})

describe('block providers of other modules', () => {
  it('may contribute only with their published block and a key club_core does not own', () => {
    expect(CLUB_CORE_BLOCK_KEYS).toEqual(['description', 'conditions', 'materials', 'contact'])
    expect(providerMayContribute(everything, { block: 'prices', key: 'prices' })).toBe(true)
    expect(providerMayContribute(DEFAULT_PUBLICATION, { block: 'prices', key: 'prices' })).toBe(false)
    expect(providerMayContribute(everything, { block: 'description_schedule', key: 'description' })).toBe(false)
  })
})
