// The sessionless public pages of a club (club spec DD-23, DD-28, DD-29, DD-35, REQ-025, REQ-028; #29), registered in
// DI as `clubCorePublicSite`. Every read starts with the one approved system-scope operation — the read-only,
// index-backed lookup of the globally unique `public_slug` (`lookupClubByPublicSlug`, AGENTS.md exception D-024/D-026)
// — and every later query carries the tenant and organization it found. An unknown slug, a section that is not public
// (or inactive, deleted, without a slug, or of another club) and a file that is not published all answer the same
// `not_found`; a club whose page is off answers `disabled` and nothing else about it.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { ClubSettings, Section, SectionMaterial } from '../data/entities'
import { lookupClubByPublicSlug } from '../data/queries'
import { effectiveLogo, nameInitial, type LogoSource } from '../lib/files'
import {
  clubContact,
  isMaterialPublished,
  providerMayContribute,
  sectionBlocks,
  type ClubCoreSectionBlocks,
} from '../lib/public-page'
import { isPublicSlug, publishedBlocks, resolvePublication, type Publication } from '../lib/publication'
import {
  PUBLIC_BLOCK_PROVIDER_TOKENS,
  type PublicBlockContext,
  type PublicBlockProvider,
  type PublicSectionBlockContext,
} from './public-blocks'

const logger = createLogger('club_core').child({ component: 'public-site' })

export type PublicSiteResult<T> = { status: 'not_found' } | { status: 'disabled' } | { status: 'ok'; value: T }

export type PublicLogo = { url: string | null; source: LogoSource; initial: string }

export type PublicClubPage = {
  club: {
    name: string
    slug: string
    description: string | null
    logo: PublicLogo
    contact: { phone: string } | null
  }
  sections: { name: string; slug: string; logo: PublicLogo }[]
  /** Blocks of optional providers (the places calendar, phase 5); absent while none contributes. */
  blocks: Record<string, unknown>
}

export type PublicSectionPage = {
  club: { name: string; slug: string; logo: PublicLogo }
  section: { name: string; slug: string; logo: PublicLogo }
  blocks: ClubCoreSectionBlocks & Record<string, unknown>
}

/** A published file and the exact attachment owner and assignment the read must match. */
export type PublicFileRef = {
  tenantId: string
  organizationId: string
  attachmentId: string
  owner: { entityId: string; recordId: string }
  assignment: { type: string; id: string }
  /** The type checked by its bytes at upload (materials); the platform serves non-inline types as octet-stream. */
  mimeType?: string
}

export type ClubCorePublicSite = {
  clubPage(clubSlug: string): Promise<PublicSiteResult<PublicClubPage>>
  sectionPage(clubSlug: string, sectionSlug: string): Promise<PublicSiteResult<PublicSectionPage>>
  clubLogo(clubSlug: string): Promise<PublicSiteResult<PublicFileRef>>
  sectionLogo(clubSlug: string, sectionSlug: string): Promise<PublicSiteResult<PublicFileRef>>
  material(clubSlug: string, sectionSlug: string, materialId: string): Promise<PublicSiteResult<PublicFileRef>>
}

/** The attachment owners and assignments the logo and material commands write (`commands/logos.ts`, `materials.ts`). */
const CLUB_LOGO = { entityId: 'club_core:club_settings', assignment: 'club_core:club_logo' }
const SECTION_LOGO = { entityId: 'club_core:section', assignment: 'club_core:section_logo' }
const MATERIAL = { entityId: 'club_core:section', assignment: 'club_core:section_material' }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FoundClub = {
  tenantId: string
  organizationId: string
  slug: string
  settings: ClubSettings
  publication: Publication
}

const NOT_FOUND = { status: 'not_found' } as const
const DISABLED = { status: 'disabled' } as const

/** A short cache-busting version of a logo URL: changes with the file, reveals nothing usable. */
const version = (attachmentId: string): string => attachmentId.slice(0, 8)

export const publicClubPath = (clubSlug: string): string => `/api/club_core/public/${encodeURIComponent(clubSlug)}`

export const publicSectionPath = (clubSlug: string, sectionSlug: string): string =>
  `${publicClubPath(clubSlug)}/sections/${encodeURIComponent(sectionSlug)}`

export function createClubCorePublicSite(getEm: () => EntityManager, container: AwilixContainer): ClubCorePublicSite {
  const em = (): EntityManager => getEm().fork()

  /** The lookup (DD-35), then the settings row narrowed to the tenant and organization it found. */
  async function findClub(db: EntityManager, clubSlug: string): Promise<PublicSiteResult<FoundClub>> {
    if (!isPublicSlug(clubSlug)) return NOT_FOUND
    const found = await lookupClubByPublicSlug(db, clubSlug)
    if (!found) return NOT_FOUND
    const settings = await db.findOne(ClubSettings, {
      id: found.settingsId,
      tenantId: found.tenantId,
      organizationId: found.organizationId,
      deletedAt: null,
    })
    if (!settings) return NOT_FOUND
    const publication = resolvePublication(settings.publication)
    if (!publication.enabled) return DISABLED
    return {
      status: 'ok',
      value: { tenantId: found.tenantId, organizationId: found.organizationId, slug: clubSlug, settings, publication },
    }
  }

  async function findSection(db: EntityManager, club: FoundClub, sectionSlug: string): Promise<Section | null> {
    if (!isPublicSlug(sectionSlug)) return null
    return db.findOne(Section, {
      tenantId: club.tenantId,
      organizationId: club.organizationId,
      publicSlug: sectionSlug,
      isPublic: true,
      isActive: true,
      deletedAt: null,
    })
  }

  /** The club's short name, else the organization's name (read in the found tenant only). */
  async function clubName(db: EntityManager, club: FoundClub): Promise<string> {
    if (club.settings.shortName) return club.settings.shortName
    const organization = await findOneWithDecryption(
      db,
      Organization,
      { id: club.organizationId, tenant: club.tenantId, deletedAt: null },
      undefined,
      { tenantId: club.tenantId, organizationId: club.organizationId },
    )
    return organization?.name ?? club.slug
  }

  function clubLogoOf(club: FoundClub, name: string): PublicLogo {
    const logo = effectiveLogo({ clubLogoId: club.settings.logoAttachmentId ?? null })
    return {
      url: logo.attachmentId ? `${publicClubPath(club.slug)}/logo?v=${version(logo.attachmentId)}` : null,
      source: logo.source,
      initial: nameInitial(name),
    }
  }

  /** Section logo ?? club logo ?? the initial of the club name (glossary *Logo*). */
  function sectionLogoOf(club: FoundClub, section: Section, clubLogo: PublicLogo): PublicLogo {
    const logo = effectiveLogo({
      sectionLogoId: section.logoAttachmentId ?? null,
      clubLogoId: club.settings.logoAttachmentId ?? null,
    })
    if (logo.source === 'section' && logo.attachmentId) {
      const slug = section.publicSlug as string
      return {
        url: `${publicSectionPath(club.slug, slug)}/logo?v=${version(logo.attachmentId)}`,
        source: 'section',
        initial: nameInitial(section.name),
      }
    }
    return clubLogo
  }

  /** The registered providers whose block the club publishes, in token order. */
  function providers(publication: Publication): PublicBlockProvider[] {
    const found: PublicBlockProvider[] = []
    for (const token of PUBLIC_BLOCK_PROVIDER_TOKENS) {
      if (!container.hasRegistration(token)) continue
      try {
        const provider = container.resolve<PublicBlockProvider>(token)
        if (providerMayContribute(publication, provider)) found.push(provider)
      } catch (error: unknown) {
        logger.warn('A public block provider could not be resolved; its block is left out', { token, err: error })
      }
    }
    return found
  }

  /** Each provider's block, keyed by the provider; a failing provider or a null result leaves its block out. */
  async function providerBlocks(
    publication: Publication,
    call: (provider: PublicBlockProvider) => Promise<unknown> | undefined,
  ): Promise<Record<string, unknown>> {
    const blocks: Record<string, unknown> = {}
    for (const provider of providers(publication)) {
      try {
        const block = await call(provider)
        if (block !== null && block !== undefined) blocks[provider.key] = block
      } catch (error: unknown) {
        logger.warn('A public block provider failed; its block is left out', { key: provider.key, err: error })
      }
    }
    return blocks
  }

  function blockContext(club: FoundClub): PublicBlockContext {
    return {
      tenantId: club.tenantId,
      organizationId: club.organizationId,
      clubSlug: club.slug,
      publishedBlocks: publishedBlocks(club.publication),
    }
  }

  return {
    async clubPage(clubSlug) {
      const db = em()
      const found = await findClub(db, clubSlug)
      if (found.status !== 'ok') return found
      const club = found.value
      const name = await clubName(db, club)
      const clubLogo = clubLogoOf(club, name)
      const sections = await db.find(
        Section,
        {
          tenantId: club.tenantId,
          organizationId: club.organizationId,
          isPublic: true,
          isActive: true,
          deletedAt: null,
          publicSlug: { $ne: null },
        },
        { orderBy: { name: 'asc' } },
      )
      const context = blockContext(club)
      const blocks = await providerBlocks(club.publication, (provider) => provider.clubBlock?.(context))
      return {
        status: 'ok',
        value: {
          club: {
            name,
            slug: club.slug,
            description: club.settings.publicDescription ?? null,
            logo: clubLogo,
            contact: clubContact(club.publication, club.settings.contactPhone ?? null),
          },
          sections: sections.map((section) => ({
            name: section.name,
            slug: section.publicSlug as string,
            logo: sectionLogoOf(club, section, clubLogo),
          })),
          blocks,
        },
      }
    },

    async sectionPage(clubSlug, sectionSlug) {
      const db = em()
      const found = await findClub(db, clubSlug)
      if (found.status !== 'ok') return found
      const club = found.value
      const section = await findSection(db, club, sectionSlug)
      if (!section) return NOT_FOUND
      const name = await clubName(db, club)
      const clubLogo = clubLogoOf(club, name)
      const materials = club.publication.blocks.materials
        ? await db.find(
            SectionMaterial,
            {
              tenantId: club.tenantId,
              organizationId: club.organizationId,
              sectionId: section.id,
              isPublic: true,
              deletedAt: null,
            },
            { orderBy: { title: 'asc' } },
          )
        : []
      const own = sectionBlocks(
        club.publication,
        {
          publicDescription: section.publicDescription ?? null,
          publicConditions: section.publicConditions ?? null,
          publicContactName: section.publicContactName ?? null,
          publicContactEmail: section.publicContactEmail ?? null,
          publicContactPhone: section.publicContactPhone ?? null,
        },
        materials,
        (materialId) => `${publicSectionPath(club.slug, sectionSlug)}/materials/${materialId}`,
      )
      const context: PublicSectionBlockContext = { ...blockContext(club), sectionId: section.id, sectionSlug }
      const extra = await providerBlocks(club.publication, (provider) => provider.sectionBlock?.(context))
      return {
        status: 'ok',
        value: {
          club: { name, slug: club.slug, logo: clubLogo },
          section: { name: section.name, slug: sectionSlug, logo: sectionLogoOf(club, section, clubLogo) },
          blocks: { ...extra, ...own },
        },
      }
    },

    async clubLogo(clubSlug) {
      const db = em()
      const found = await findClub(db, clubSlug)
      if (found.status !== 'ok') return found
      const club = found.value
      const attachmentId = club.settings.logoAttachmentId
      if (!attachmentId) return NOT_FOUND
      return {
        status: 'ok',
        value: {
          tenantId: club.tenantId,
          organizationId: club.organizationId,
          attachmentId,
          owner: { entityId: CLUB_LOGO.entityId, recordId: club.settings.id },
          assignment: { type: CLUB_LOGO.assignment, id: club.settings.id },
        },
      }
    },

    async sectionLogo(clubSlug, sectionSlug) {
      const db = em()
      const found = await findClub(db, clubSlug)
      if (found.status !== 'ok') return found
      const club = found.value
      const section = await findSection(db, club, sectionSlug)
      const attachmentId = section?.logoAttachmentId
      if (!section || !attachmentId) return NOT_FOUND
      return {
        status: 'ok',
        value: {
          tenantId: club.tenantId,
          organizationId: club.organizationId,
          attachmentId,
          owner: { entityId: SECTION_LOGO.entityId, recordId: section.id },
          assignment: { type: SECTION_LOGO.assignment, id: section.id },
        },
      }
    },

    async material(clubSlug, sectionSlug, materialId) {
      if (!UUID_PATTERN.test(materialId)) return NOT_FOUND
      const db = em()
      const found = await findClub(db, clubSlug)
      if (found.status !== 'ok') return found
      const club = found.value
      const section = await findSection(db, club, sectionSlug)
      if (!section) return NOT_FOUND
      const material = await db.findOne(SectionMaterial, {
        id: materialId,
        tenantId: club.tenantId,
        organizationId: club.organizationId,
        sectionId: section.id,
        deletedAt: null,
      })
      if (!material || !isMaterialPublished(club.publication, material)) return NOT_FOUND
      return {
        status: 'ok',
        value: {
          tenantId: club.tenantId,
          organizationId: club.organizationId,
          attachmentId: material.attachmentId,
          owner: { entityId: MATERIAL.entityId, recordId: section.id },
          assignment: { type: MATERIAL.assignment, id: material.id },
          mimeType: material.mimeType,
        },
      }
    },
  }
}
