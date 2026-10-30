// The `club_core` blocks of the public pages (club spec DD-28, DD-29, glossary *Publication*; REQ-025): what a guest
// gets for the club and for one public section. Pure: a block the club disabled is left out of the result (absent from
// the API response, not hidden by the page), and an enabled block with nothing to show is left out as well. Blocks of
// later modules (groups, schedule, prices, places) come from optional DI providers and are merged by the service.
import { isBlockPublished, type Publication, type PublicationBlock } from './publication'

/** Section content written for publication (glossary *Section*: "for publication" fields, never people records). */
export type SectionPublicContent = {
  publicDescription: string | null
  publicConditions: string | null
  publicContactName: string | null
  publicContactEmail: string | null
  publicContactPhone: string | null
}

export type SectionMaterialRow = {
  id: string
  title: string
  fileName: string
  mimeType: string
  fileSize: number
  isPublic: boolean
}

export type PublicMaterial = {
  id: string
  title: string
  fileName: string
  mimeType: string
  fileSize: number
  url: string
}

export type PublicContact = { name: string | null; email: string | null; phone: string | null }

/** The `club_core` blocks of a section page; `description` is the description half of `description_schedule`. */
export type ClubCoreSectionBlocks = {
  description?: { text: string }
  conditions?: { text: string }
  materials?: { items: PublicMaterial[] }
  contact?: PublicContact
}

/** Response keys `club_core` owns; a block provider of another module never overwrites them. */
export const CLUB_CORE_BLOCK_KEYS = ['description', 'conditions', 'materials', 'contact'] as const

const filled = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim() !== ''

/** The section's `club_core` blocks for a guest, in page order. */
export function sectionBlocks(
  publication: Publication,
  content: SectionPublicContent,
  materials: readonly SectionMaterialRow[],
  materialUrl: (materialId: string) => string,
): ClubCoreSectionBlocks {
  const blocks: ClubCoreSectionBlocks = {}
  if (isBlockPublished(publication, 'description_schedule') && filled(content.publicDescription)) {
    blocks.description = { text: content.publicDescription }
  }
  if (isBlockPublished(publication, 'conditions') && filled(content.publicConditions)) {
    blocks.conditions = { text: content.publicConditions }
  }
  const published = materials.filter((material) => material.isPublic)
  if (isBlockPublished(publication, 'materials') && published.length > 0) {
    blocks.materials = {
      items: published.map(({ id, title, fileName, mimeType, fileSize }) => ({
        id,
        title,
        fileName,
        mimeType,
        fileSize,
        url: materialUrl(id),
      })),
    }
  }
  const contact: PublicContact = {
    name: filled(content.publicContactName) ? content.publicContactName : null,
    email: filled(content.publicContactEmail) ? content.publicContactEmail : null,
    phone: filled(content.publicContactPhone) ? content.publicContactPhone : null,
  }
  if (isBlockPublished(publication, 'contact') && (contact.name || contact.email || contact.phone)) {
    blocks.contact = contact
  }
  return blocks
}

/** The club's own contact on its page: the club phone, only with the `contact` block. */
export function clubContact(publication: Publication, contactPhone: string | null): { phone: string } | null {
  return isBlockPublished(publication, 'contact') && filled(contactPhone) ? { phone: contactPhone } : null
}

/** A material a guest may download: public, of a public section, with the `materials` block on. */
export function isMaterialPublished(publication: Publication, material: Pick<SectionMaterialRow, 'isPublic'>): boolean {
  return isBlockPublished(publication, 'materials') && material.isPublic
}

/**
 * Whether a block provider of another module may contribute: the club publishes its block and the provider's key does
 * not collide with a `club_core` key.
 */
export function providerMayContribute(
  publication: Publication,
  provider: { block: PublicationBlock; key: string },
): boolean {
  return (
    isBlockPublished(publication, provider.block) && !(CLUB_CORE_BLOCK_KEYS as readonly string[]).includes(provider.key)
  )
}
