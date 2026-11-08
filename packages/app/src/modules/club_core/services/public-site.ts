// The sessionless public pages of a club (club spec DD-23, DD-28, DD-29, DD-35, REQ-025, REQ-028; #29), registered in
// DI as `clubCorePublicSite`. Every read starts with the one approved system-scope operation — the read-only,
// index-backed lookup of the globally unique `public_slug` (`lookupClubByPublicSlug`, AGENTS.md exception D-024/D-026)
// — and every later query carries the tenant and organization it found. An unknown slug, a section that is not public
// (or inactive, deleted, without a slug, or of another club) and a file that is not published all answer the same
// `not_found`; a club whose page is off answers `disabled` and nothing else about it. The public places (#124) need the
// `places_calendar` block too (`disabled` without it) and `is_public_schedule` on an active, live place with a slug
// (DD-29); a place's photos and regulations PDF are served under its public slug.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { ClubSettings, Place, PlaceFile, Section, SectionMaterial } from '../data/entities'
import { lookupClubByPublicSlug } from '../data/queries'
import { effectiveLogo, nameInitial, type LogoSource } from '../lib/files'
import {
  clubContact,
  isMaterialPublished,
  providerMayContribute,
  sectionBlocks,
  type ClubCoreSectionBlocks,
} from '../lib/public-page'
import { PLACE_FILE_ASSIGNMENT, PLACE_FILE_OWNER_ENTITY } from '../lib/files'
import {
  isPublicSlug,
  publishedBlocks,
  resolvePublication,
  type Publication,
  type PublicationBlock,
} from '../lib/publication'
import {
  PUBLIC_BLOCK_PROVIDER_TOKENS,
  type PublicBlockContext,
  type PublicBlockProvider,
  type PublicClubBlockContext,
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
    contact: PublicClubContact
  }
  /** The tiles of the public sections; `shortDescription` is the section's tile text (UX parity spec REQ-U02). */
  sections: { name: string; slug: string; logo: PublicLogo; shortDescription: string | null }[]
  /** Blocks of optional providers (upcoming events #91, the places calendar in phase 5); absent while none contributes. */
  blocks: Record<string, unknown>
}

/** The club's own contact in the page footer: the club phone, only with the `contact` block (E06-S07, #89). */
export type PublicClubContact = { phone: string } | null

export type PublicSectionPage = {
  club: { name: string; slug: string; logo: PublicLogo; contact: PublicClubContact }
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

/** The trusted scope of a club found by its public slug and the header of its public pages. */
export type PublicClubFrame = {
  tenantId: string
  organizationId: string
  club: { name: string; slug: string; logo: PublicLogo; contact: PublicClubContact }
  /** Every block the club publishes (e.g. `online_requests` for the public places, #124). */
  publishedBlocks: readonly PublicationBlock[]
}

/**
 * A place with a public calendar (P-03, #124). `id` is for the module that serves the calendar (`facilities`), which
 * must not put it in a public response. `acceptsOnlineRequests` is the place's switch AND the club's `online_requests`
 * block.
 */
export type PublicPlace = {
  id: string
  slug: string
  name: string
  kind: string
  surface: string | null
  address: string | null
  /** The first photo, or null. */
  photoUrl: string | null
  acceptsOnlineRequests: boolean
}

/** One public place in full (P-04): its photos, its rules and the URL of its regulations PDF. */
export type PublicPlaceDetail = PublicPlace & {
  photoUrls: string[]
  regulationsText: string | null
  regulationsUrl: string | null
}

export type PublicPlacesPage = { frame: PublicClubFrame; places: PublicPlace[] }

export type PublicPlacePage = { frame: PublicClubFrame; place: PublicPlaceDetail }

export type ClubCorePublicSite = {
  clubPage(clubSlug: string): Promise<PublicSiteResult<PublicClubPage>>
  sectionPage(clubSlug: string, sectionSlug: string): Promise<PublicSiteResult<PublicSectionPage>>
  clubLogo(clubSlug: string): Promise<PublicSiteResult<PublicFileRef>>
  /**
   * The club behind a public slug — its trusted tenant and organization and the header of its public pages — for a
   * sessionless page another module serves under `/p/[clubSlug]` (the DD-17 session page of `activities`, foundation
   * III DD-M14). The same lookup and the same `not_found` / `disabled` answers as the club page.
   */
  clubFrame(clubSlug: string): Promise<PublicSiteResult<PublicClubFrame>>
  sectionLogo(clubSlug: string, sectionSlug: string): Promise<PublicSiteResult<PublicFileRef>>
  material(clubSlug: string, sectionSlug: string, materialId: string): Promise<PublicSiteResult<PublicFileRef>>
  /**
   * The club's places with a public calendar, by name (P-03, #124): `disabled` while the club does not publish its page
   * or its `places_calendar` block.
   */
  publicPlaces(clubSlug: string): Promise<PublicSiteResult<PublicPlacesPage>>
  /** One place with a public calendar by its slug (P-04); `not_found` for an unknown or non-public place. */
  publicPlace(clubSlug: string, placeSlug: string): Promise<PublicSiteResult<PublicPlacePage>>
  /** A photo or the regulations PDF of a place with a public calendar. */
  placeFile(clubSlug: string, placeSlug: string, fileId: string): Promise<PublicSiteResult<PublicFileRef>>
}

/** The attachment owners and assignments the logo and material commands write (`commands/logos.ts`, `materials.ts`). */
const CLUB_LOGO = { entityId: 'club_core:club_settings', assignment: 'club_core:club_logo' }
const SECTION_LOGO = { entityId: 'club_core:section', assignment: 'club_core:section_logo' }
const MATERIAL = { entityId: 'club_core:section', assignment: 'club_core:section_material' }

/** The columns a public place read needs: never the encrypted contacts or the internal description. */
const PUBLIC_PLACE_FIELDS = [
  'id',
  'name',
  'kind',
  'surface',
  'address',
  'publicSlug',
  'acceptsOnlineRequests',
  'regulationsText',
] as const

type PublicPlaceRow = Pick<Place, (typeof PUBLIC_PLACE_FIELDS)[number]>

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

export const publicPlaceFilePath = (clubSlug: string, placeSlug: string, fileId: string): string =>
  `${publicClubPath(clubSlug)}/places/${encodeURIComponent(placeSlug)}/files/${fileId}`

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

  /** The footer contact of every public page: the club phone, only with the `contact` block. */
  function contactOf(club: FoundClub): PublicClubContact {
    return clubContact(club.publication, club.settings.contactPhone ?? null)
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

  /** The club found by its slug, with its places calendar published (`disabled` otherwise). */
  async function findPlacesClub(db: EntityManager, clubSlug: string): Promise<PublicSiteResult<FoundClub>> {
    const found = await findClub(db, clubSlug)
    if (found.status !== 'ok') return found
    return found.value.publication.blocks.places_calendar ? found : DISABLED
  }

  async function frameOf(db: EntityManager, club: FoundClub): Promise<PublicClubFrame> {
    const name = await clubName(db, club)
    return {
      tenantId: club.tenantId,
      organizationId: club.organizationId,
      club: { name, slug: club.slug, logo: clubLogoOf(club, name), contact: contactOf(club) },
      publishedBlocks: publishedBlocks(club.publication),
    }
  }

  /** The live, active place with a public calendar behind a slug (DD-29), or null. */
  async function findPublicPlace(
    db: EntityManager,
    club: FoundClub,
    placeSlug: string,
  ): Promise<PublicPlaceRow | null> {
    if (!isPublicSlug(placeSlug)) return null
    return db.findOne(
      Place,
      {
        tenantId: club.tenantId,
        organizationId: club.organizationId,
        publicSlug: placeSlug,
        isPublicSchedule: true,
        isActive: true,
        deletedAt: null,
      },
      { fields: [...PUBLIC_PLACE_FIELDS] },
    )
  }

  async function placeFiles(db: EntityManager, club: FoundClub, placeIds: readonly string[]): Promise<PlaceFile[]> {
    if (placeIds.length === 0) return []
    return db.find(
      PlaceFile,
      {
        tenantId: club.tenantId,
        organizationId: club.organizationId,
        placeId: { $in: [...placeIds] },
        deletedAt: null,
      },
      { orderBy: { position: 'asc', createdAt: 'asc' } },
    )
  }

  function publicPlaceOf(club: FoundClub, place: PublicPlaceRow, files: readonly PlaceFile[]): PublicPlace {
    const slug = place.publicSlug as string
    const photo = files.find((file) => file.kind === 'photo' && file.placeId === place.id)
    return {
      id: place.id,
      slug,
      name: place.name,
      kind: place.kind,
      surface: place.surface ?? null,
      address: place.address ?? null,
      photoUrl: photo ? publicPlaceFilePath(club.slug, slug, photo.id) : null,
      acceptsOnlineRequests: place.acceptsOnlineRequests && club.publication.blocks.online_requests,
    }
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
      const context: PublicClubBlockContext = {
        ...blockContext(club),
        sections: sections.map((section) => ({
          id: section.id,
          name: section.name,
          slug: section.publicSlug as string,
        })),
      }
      const blocks = await providerBlocks(club.publication, (provider) => provider.clubBlock?.(context))
      return {
        status: 'ok',
        value: {
          club: {
            name,
            slug: club.slug,
            description: club.settings.publicDescription ?? null,
            logo: clubLogo,
            contact: contactOf(club),
          },
          sections: sections.map((section) => ({
            name: section.name,
            slug: section.publicSlug as string,
            logo: sectionLogoOf(club, section, clubLogo),
            shortDescription: section.shortDescription ?? null,
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
          club: { name, slug: club.slug, logo: clubLogo, contact: contactOf(club) },
          section: { name: section.name, slug: sectionSlug, logo: sectionLogoOf(club, section, clubLogo) },
          blocks: { ...extra, ...own },
        },
      }
    },

    async clubFrame(clubSlug) {
      const db = em()
      const found = await findClub(db, clubSlug)
      if (found.status !== 'ok') return found
      return { status: 'ok', value: await frameOf(db, found.value) }
    },

    async publicPlaces(clubSlug) {
      const db = em()
      const found = await findPlacesClub(db, clubSlug)
      if (found.status !== 'ok') return found
      const club = found.value
      const places = await db.find(
        Place,
        {
          tenantId: club.tenantId,
          organizationId: club.organizationId,
          isPublicSchedule: true,
          isActive: true,
          deletedAt: null,
          publicSlug: { $ne: null },
        },
        { fields: [...PUBLIC_PLACE_FIELDS], orderBy: { name: 'asc' } },
      )
      const files = await placeFiles(
        db,
        club,
        places.map((place) => place.id),
      )
      return {
        status: 'ok',
        value: { frame: await frameOf(db, club), places: places.map((place) => publicPlaceOf(club, place, files)) },
      }
    },

    async publicPlace(clubSlug, placeSlug) {
      const db = em()
      const found = await findPlacesClub(db, clubSlug)
      if (found.status !== 'ok') return found
      const club = found.value
      const place = await findPublicPlace(db, club, placeSlug)
      if (!place) return NOT_FOUND
      const files = await placeFiles(db, club, [place.id])
      const regulations = files.find((file) => file.kind === 'regulations')
      return {
        status: 'ok',
        value: {
          frame: await frameOf(db, club),
          place: {
            ...publicPlaceOf(club, place, files),
            photoUrls: files
              .filter((file) => file.kind === 'photo')
              .map((file) => publicPlaceFilePath(club.slug, placeSlug, file.id)),
            regulationsText: place.regulationsText ?? null,
            regulationsUrl: regulations ? publicPlaceFilePath(club.slug, placeSlug, regulations.id) : null,
          },
        },
      }
    },

    async placeFile(clubSlug, placeSlug, fileId) {
      if (!UUID_PATTERN.test(fileId)) return NOT_FOUND
      const db = em()
      const found = await findPlacesClub(db, clubSlug)
      if (found.status !== 'ok') return found
      const club = found.value
      const place = await findPublicPlace(db, club, placeSlug)
      if (!place) return NOT_FOUND
      const file = await db.findOne(PlaceFile, {
        id: fileId,
        tenantId: club.tenantId,
        organizationId: club.organizationId,
        placeId: place.id,
        deletedAt: null,
      })
      if (!file) return NOT_FOUND
      return {
        status: 'ok',
        value: {
          tenantId: club.tenantId,
          organizationId: club.organizationId,
          attachmentId: file.attachmentId,
          owner: { entityId: PLACE_FILE_OWNER_ENTITY, recordId: place.id },
          assignment: { type: PLACE_FILE_ASSIGNMENT, id: file.id },
          mimeType: file.mimeType,
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
