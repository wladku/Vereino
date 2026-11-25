// `trainingLibrary` (training outlines spec DD-O10, DD-O10a, DD-O11…DD-O15; REQ-O11…REQ-O16; E24-S05, #685): the only
// code that reads or writes the library tenant. Its scope is the configured library tenant and organization
// (`VEREINO_LIBRARY_TENANT_ID`, `VEREINO_LIBRARY_ORGANIZATION_ID`), never a scope from a request; a club request reaches
// it only through the publish, copy, rating, use and report commands, and a publication copies an allow-listed
// snapshot (no session, group or person ids; images with their metadata stripped). Readers see only `listed` entries
// at the visibilities they may see; the source club and outline of an entry never leave this service, raters are
// pseudonymous keys (DD-O12). Without the configuration the library is off and every entry point answers 404
// `library_not_configured`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { AwilixContainer } from 'awilix'
import { detectFileFormat, FORMAT_MIME_TYPES } from '@vereino/core'
import { trainingErrors } from '../api/errors'
import { LibraryEntry, LibraryRating, LibraryReport, LibraryUse } from '../data/entities'
import {
  entriesAdaptedFrom,
  libraryRatingTotals,
  recomputeLibraryAggregates,
  reportingClubs,
  searchLibraryEntryIds,
} from '../data/queries'
import { stripImageMetadata } from '../lib/image-metadata'
import {
  LIBRARY_LICENCE,
  LIBRARY_LICENCE_URL,
  RANKING_PRIOR_WEIGHT,
  aboveLevel,
  allRaterKeys,
  averageRating,
  currentRaterKey,
  hiddenByReports,
  likePattern,
  meanRating,
  partsWithExercises,
  publicReporterKey,
  readCredit,
  readLibraryConfig,
  readLibraryParts,
  withoutAuthorName,
  type LibraryConfig,
  type LibraryCredit,
  type LibraryLevel,
  type LibraryParts,
  type LibrarySearch,
  type LibrarySnapshot,
  type ModerationAction,
  type PublishVisibility,
  type ReportReason,
} from '../lib/library'
import type { OutlinePart } from '../lib/outline'

export const TRAINING_LIBRARY = 'trainingLibrary'

/** The owner of a library image: the entry it belongs to (`attachments` owner and only assignment). */
export const LIBRARY_IMAGE_OWNER_ENTITY = 'training:library_entry'
export const LIBRARY_IMAGE_PARTITION = 'privateAttachments'

export type LibraryScope = { tenantId: string; organizationId: string }

/** Who reads the library: a signed-in user of a club (with their person, when linked) or a guest of the public page. */
export type LibraryViewer = { kind: 'club'; organizationId: string; personId: string | null } | { kind: 'public' }

export type LibraryCardView = {
  id: string
  visibility: PublishVisibility
  language: string
  topic: string
  ageCategory: string
  durationMinutes: number
  parts: OutlinePart[]
  credit: LibraryCredit
  averageRating: number | null
  ratingCount: number
  userCount: number
  publishedAt: string
  /** The entry was published by the viewer's own club. */
  ownClub: boolean
}

export type LibraryEntryView = Omit<LibraryCardView, 'parts'> & {
  goal: string
  specificGoals: string
  playersCount: number | null
  equipment: string
  parts: LibraryParts
  /** One URL per image, in the order the parts' `image` indexes name. */
  images: string[]
  licence: string
  licenceUrl: string
  /** What the signed-in coach did with the entry; null for a guest or a user linked to no person. */
  mine: { used: boolean; stars: number | null; reported: boolean } | null
}

export type LibraryList = {
  items: LibraryCardView[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** A file a publication or a copy writes: already checked and stripped. */
export type LibraryImageFile = { buffer: Buffer; fileName: string; mimeType: string }

const PUBLIC_VISIBILITIES = ['public'] as const
const CLUB_VISIBILITIES = ['clubs', 'public'] as const

function visibilitiesFor(viewer: LibraryViewer): readonly string[] {
  return viewer.kind === 'public' ? PUBLIC_VISIBILITIES : CLUB_VISIBILITIES
}

/** The URL of an entry's image as the viewer reads it. */
export function libraryImageUrl(entryId: string, index: number, viewer: LibraryViewer): string {
  const base = viewer.kind === 'public' ? '/api/training/public/library' : '/api/training/library'
  return `${base}/${encodeURIComponent(entryId)}/images/${String(index)}`
}

function cardOf(row: LibraryEntry, viewer: LibraryViewer): LibraryCardView {
  return {
    id: row.id,
    visibility: row.visibility as PublishVisibility,
    language: row.language,
    topic: row.topic,
    ageCategory: row.ageCategory,
    durationMinutes: row.durationMinutes,
    parts: partsWithExercises(readLibraryParts(row.parts)),
    credit: readCredit(row.credit) ?? { clubName: '', authorName: null, adaptedFrom: null },
    averageRating: averageRating(row),
    ratingCount: row.ratingCount,
    userCount: row.userCount,
    publishedAt: row.publishedAt.toISOString(),
    ownClub: viewer.kind === 'club' && viewer.organizationId === row.sourceOrganizationId,
  }
}

function attachments(container: AwilixContainer): AttachmentService | null {
  return container.hasRegistration('attachmentService')
    ? container.resolve<AttachmentService>('attachmentService')
    : null
}

function imageOwner(entryId: string) {
  return {
    expectedOwner: { entityId: LIBRARY_IMAGE_OWNER_ENTITY, recordId: entryId },
    expectedAssignment: { type: LIBRARY_IMAGE_OWNER_ENTITY, id: entryId },
    expectedPartitionCode: LIBRARY_IMAGE_PARTITION,
  }
}

/** The publication of an outline as the commands hand it over (built from the allow-list snapshot). */
export type PublicationInput = {
  club: LibraryScope
  outlineId: string
  visibility: PublishVisibility
  snapshot: LibrarySnapshot
  credit: LibraryCredit
  /** The library attachment ids of the snapshot's images, in index order (uploaded by `uploadImages`). */
  images: string[]
}

export type TrainingLibrary = {
  /** The configuration; null when the library is off. */
  config(): LibraryConfig | null
  /** The library scope, or 404 `library_not_configured`. */
  requireScope(): Promise<LibraryScope>

  // Reads
  search(query: LibrarySearch, viewer: LibraryViewer): Promise<LibraryList>
  /** One listed entry the viewer may see, or null. */
  view(entryId: string, viewer: LibraryViewer): Promise<LibraryEntryView | null>
  /** The snapshot of a listed entry the viewer may see (for a copy), or null. */
  snapshotOf(
    entryId: string,
    viewer: LibraryViewer,
    em?: EntityManager,
  ): Promise<{ entry: LibraryEntry; parts: LibraryParts; credit: LibraryCredit } | null>
  /** The bytes of image `index` of a listed entry the viewer may see, or null. */
  readImage(entryId: string, index: number, viewer: LibraryViewer): Promise<LibraryImageFile | null>
  /** The entry an outline of `club` is published as, or null. */
  publishedEntry(em: EntityManager, club: LibraryScope, outlineId: string): Promise<LibraryEntry | null>

  // Files (each upload is its own transaction of the platform `attachments` module)
  /**
   * Strips each image's metadata and stores it in the library tenant, owned by `entryId`: one attachment id per file,
   * in order, or null for a file it cannot clean (left out of the publication).
   */
  uploadImages(entryId: string, files: readonly (LibraryImageFile | null)[]): Promise<(string | null)[]>
  /** Releases library images (after the commit that stopped referencing them); a failure keeps the file. */
  releaseImages(entryId: string, attachmentIds: readonly string[]): Promise<void>

  // Writes in the caller's transaction (`em`)
  /** Creates or replaces the entry of the outline; returns it and the images the replaced snapshot held. */
  publish(
    em: EntityManager,
    input: PublicationInput,
    entryId: string,
  ): Promise<{ entry: LibraryEntry; replacedImages: string[] }>
  /** Deletes entries with their ratings, uses and reports; returns the deleted entries' images by entry. */
  deleteEntries(em: EntityManager, entryIds: readonly string[]): Promise<Map<string, string[]>>
  /** The club's entries above `level` (BR-O5). */
  entriesAboveLevel(em: EntityManager, club: LibraryScope, level: LibraryLevel): Promise<LibraryEntry[]>
  /** Records a use by each person of the club (one row per rater key; a repeat counts another session). */
  recordUses(em: EntityManager, entryId: string, club: LibraryScope, personIds: readonly string[]): Promise<number>
  /** BR-O6: sets the person's rating; 409 `rating_requires_use` without a use. */
  rate(em: EntityManager, entryId: string, club: LibraryScope, personId: string, stars: number): Promise<LibraryEntry>
  /** REQ-O15: a club user's report; hides the entry at three clubs (DD-O14). */
  report(
    em: EntityManager,
    entryId: string,
    reporter: { club: LibraryScope; personId: string } | { address: string },
    input: { reason: ReportReason; note: string | null },
    viewer: LibraryViewer,
  ): Promise<{ entry: LibraryEntry; hidden: boolean }>
  /** Removes the author's name from the entries `entryIds` and from the copies that credit them as origin. */
  stripAuthorName(em: EntityManager, entryIds: readonly string[]): Promise<number>
  /** Deletes every rating, use and report of the person's keys (all versions); returns the rows removed. */
  eraseRater(em: EntityManager, club: LibraryScope, personId: string): Promise<number>
  /** Club deletion: the club's entries and every rating, use and report of its coaches (many-clubs BR-M4). */
  eraseClub(
    em: EntityManager,
    club: LibraryScope,
  ): Promise<{ tables: { table: string; rows: number }[]; images: Map<string, string[]> }>
  /** Counts what `eraseClub` would delete (a dry run). */
  countClub(em: EntityManager, club: LibraryScope): Promise<{ table: string; rows: number }[]>

  /** A guest's report from the public page (P-O1), in its own transaction. */
  reportAsGuest(entryId: string, address: string, input: { reason: ReportReason; note: string | null }): Promise<void>

  // Operator (`library-moderate`)
  moderation(em?: EntityManager): Promise<LibraryEntry[]>
  /** `moderate` in its own transaction (the CLI). */
  moderateNow(entryId: string, action: Exclude<ModerationAction, 'list'>): Promise<LibraryEntry | null>
  moderate(em: EntityManager, entryId: string, action: Exclude<ModerationAction, 'list'>): Promise<LibraryEntry | null>
}

export function createTrainingLibrary(
  container: AwilixContainer,
  env: Record<string, string | undefined> = process.env,
): TrainingLibrary {
  const config = readLibraryConfig(env)
  const scopeOrNull = (): LibraryScope | null =>
    config ? { tenantId: config.tenantId, organizationId: config.organizationId } : null
  const requireScope = async (): Promise<LibraryScope> => {
    const scope = scopeOrNull()
    if (!scope) return trainingErrors.throw('library_not_configured')
    return scope
  }
  const emOf = (em?: EntityManager) => em ?? container.resolve<EntityManager>('em').fork()

  /** A listed entry the viewer may see. */
  async function visibleEntry(em: EntityManager, entryId: string, viewer: LibraryViewer) {
    const scope = await requireScope()
    return em.findOne(LibraryEntry, {
      id: entryId,
      ...scope,
      status: 'listed',
      deletedAt: null,
      visibility: { $in: [...visibilitiesFor(viewer)] },
    })
  }

  async function mineOf(em: EntityManager, scope: LibraryScope, entryId: string, viewer: LibraryViewer) {
    if (viewer.kind !== 'club' || !viewer.personId || !config) return null
    const keys = allRaterKeys(config, viewer.organizationId, viewer.personId)
    const where = { ...scope, entryId, raterKey: { $in: keys } }
    const [use, rating, report] = await Promise.all([
      em.count(LibraryUse, where),
      em.findOne(LibraryRating, where),
      em.count(LibraryReport, where),
    ])
    return { used: use > 0, stars: rating?.stars ?? null, reported: report > 0 }
  }

  async function deleteEntries(em: EntityManager, entryIds: readonly string[]): Promise<Map<string, string[]>> {
    const scope = await requireScope()
    const images = new Map<string, string[]>()
    if (entryIds.length === 0) return images
    const rows = await em.find(LibraryEntry, { ...scope, id: { $in: [...entryIds] } })
    const ids = rows.map((row) => row.id)
    if (ids.length === 0) return images
    for (const row of rows) images.set(row.id, Array.isArray(row.images) ? [...row.images] : [])
    await em.nativeDelete(LibraryRating, { ...scope, entryId: { $in: ids } })
    await em.nativeDelete(LibraryUse, { ...scope, entryId: { $in: ids } })
    await em.nativeDelete(LibraryReport, { ...scope, entryId: { $in: ids } })
    await em.nativeDelete(LibraryEntry, { ...scope, id: { $in: ids } })
    return images
  }

  return {
    config: () => config,
    requireScope,

    async search(query, viewer) {
      const scope = await requireScope()
      const em = emOf()
      const mean = meanRating(await libraryRatingTotals(em, scope))
      const { ids, total } = await searchLibraryEntryIds(
        em,
        scope,
        {
          visibilities: visibilitiesFor(viewer),
          pattern: query.q ? likePattern(query.q) : null,
          ageCategory: query.ageCategory || null,
          part: query.part ?? null,
        },
        { sort: query.sort, mean, weight: RANKING_PRIOR_WEIGHT },
        { limit: query.pageSize, offset: (query.page - 1) * query.pageSize },
      )
      const rows = ids.length > 0 ? await em.find(LibraryEntry, { id: { $in: ids }, ...scope }) : []
      const byId = new Map(rows.map((row) => [row.id, row]))
      const items = ids.flatMap((id) => {
        const row = byId.get(id)
        return row ? [cardOf(row, viewer)] : []
      })
      return {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      }
    },

    async view(entryId, viewer) {
      const scope = await requireScope()
      const em = emOf()
      const row = await visibleEntry(em, entryId, viewer)
      if (!row) return null
      const card = cardOf(row, viewer)
      const images = Array.isArray(row.images) ? row.images : []
      return {
        ...card,
        goal: row.goal,
        specificGoals: row.specificGoals,
        playersCount: row.playersCount ?? null,
        equipment: row.equipment,
        parts: readLibraryParts(row.parts),
        images: images.map((_id, index) => libraryImageUrl(row.id, index, viewer)),
        licence: row.licence,
        licenceUrl: LIBRARY_LICENCE_URL,
        mine: await mineOf(em, scope, row.id, viewer),
      }
    },

    async snapshotOf(entryId, viewer, em) {
      const row = await visibleEntry(emOf(em), entryId, viewer)
      if (!row) return null
      const credit = readCredit(row.credit) ?? { clubName: '', authorName: null, adaptedFrom: null }
      return { entry: row, parts: readLibraryParts(row.parts), credit }
    },

    async readImage(entryId, index, viewer) {
      const scope = await requireScope()
      const row = await visibleEntry(emOf(), entryId, viewer)
      const images = row && Array.isArray(row.images) ? row.images : []
      const attachmentId = images[index]
      const service = attachments(container)
      if (!row || typeof attachmentId !== 'string' || !service) return null
      try {
        const file = await service.readScoped({
          attachmentId,
          auth: { sub: 'training:library', tenantId: scope.tenantId, orgId: scope.organizationId, roles: [] },
          ...imageOwner(row.id),
          requirePrivatePartition: true,
        })
        return { buffer: file.buffer, mimeType: file.mimeType, fileName: file.fileName }
      } catch {
        return null
      }
    },

    async publishedEntry(em, club, outlineId) {
      const scope = await requireScope()
      return em.findOne(LibraryEntry, {
        ...scope,
        sourceOrganizationId: club.organizationId,
        sourceOutlineId: outlineId,
        deletedAt: null,
      })
    },

    async uploadImages(entryId, files) {
      const scope = await requireScope()
      const service = attachments(container)
      const ids: (string | null)[] = []
      for (const file of files) {
        const bytes = file ? new Uint8Array(file.buffer) : null
        const format = bytes ? detectFileFormat(bytes) : null
        const clean = bytes && format ? stripImageMetadata(bytes, format) : null
        if (!service || !file || !format || !clean) {
          ids.push(null)
          continue
        }
        const created = await service.createScoped({
          ...scope,
          entityId: LIBRARY_IMAGE_OWNER_ENTITY,
          recordId: entryId,
          partitionCode: LIBRARY_IMAGE_PARTITION,
          fileName: file.fileName,
          declaredMimeType: FORMAT_MIME_TYPES[format],
          buffer: Buffer.from(clean),
        })
        ids.push(created.id)
      }
      return ids
    },

    async releaseImages(entryId, attachmentIds) {
      const scope = scopeOrNull()
      const service = attachments(container)
      if (!scope || !service?.releaseScoped) return
      for (const attachmentId of attachmentIds) {
        try {
          await service.releaseScoped({ attachmentId, ...scope, ...imageOwner(entryId) })
        } catch {
          // The file stays; an operator can remove it with the entry's tenant.
        }
      }
    },

    async publish(em, input, entryId) {
      const scope = await requireScope()
      const existing = await em.findOne(LibraryEntry, {
        ...scope,
        sourceOrganizationId: input.club.organizationId,
        sourceOutlineId: input.outlineId,
        deletedAt: null,
      })
      const now = new Date()
      const content = {
        visibility: input.visibility,
        language: input.snapshot.language,
        topic: input.snapshot.topic,
        goal: input.snapshot.goal,
        specificGoals: input.snapshot.specificGoals,
        ageCategory: input.snapshot.ageCategory,
        durationMinutes: input.snapshot.durationMinutes,
        playersCount: input.snapshot.playersCount,
        equipment: input.snapshot.equipment,
        parts: input.snapshot.parts as unknown as Record<string, unknown>,
        images: [...input.images],
        credit: input.credit as unknown as Record<string, unknown>,
        licence: LIBRARY_LICENCE,
      }
      if (existing) {
        const replacedImages = Array.isArray(existing.images) ? [...existing.images] : []
        // A re-publication keeps the entry, its ratings and uses, and its moderation state.
        Object.assign(existing, content, { updatedAt: now })
        await em.flush()
        return { entry: existing, replacedImages }
      }
      const entry = em.create(LibraryEntry, {
        id: entryId,
        ...scope,
        sourceOrganizationId: input.club.organizationId,
        sourceOutlineId: input.outlineId,
        status: 'listed',
        ...content,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(entry)
      await em.flush()
      return { entry, replacedImages: [] }
    },

    deleteEntries,

    async entriesAboveLevel(em, club, level) {
      const scope = await requireScope()
      const rows = await em.find(LibraryEntry, {
        ...scope,
        sourceOrganizationId: club.organizationId,
        deletedAt: null,
      })
      return rows.filter((row) => aboveLevel(row.visibility, level))
    },

    async recordUses(em, entryId, club, personIds) {
      const scope = await requireScope()
      if (!config || personIds.length === 0) return 0
      const entry = await em.findOne(LibraryEntry, { ...scope, id: entryId, deletedAt: null })
      if (!entry || entry.status === 'removed') return 0
      let recorded = 0
      for (const personId of new Set(personIds)) {
        const keys = allRaterKeys(config, club.organizationId, personId)
        const existing = await em.findOne(LibraryUse, { ...scope, entryId, raterKey: { $in: keys } })
        if (existing) {
          existing.occurrenceCount += 1
          existing.updatedAt = new Date()
        } else {
          const key = currentRaterKey(config, club.organizationId, personId)
          em.persist(
            em.create(LibraryUse, {
              ...scope,
              entryId,
              raterKey: key.key,
              raterKeyVersion: key.version,
              raterOrganizationId: club.organizationId,
              occurrenceCount: 1,
            }),
          )
        }
        recorded += 1
      }
      await em.flush()
      await recomputeLibraryAggregates(em, scope, [entryId])
      return recorded
    },

    async rate(em, entryId, club, personId, stars) {
      const scope = await requireScope()
      if (!config) return trainingErrors.throw('library_not_configured')
      const viewer: LibraryViewer = { kind: 'club', organizationId: club.organizationId, personId }
      const entry = await visibleEntry(em, entryId, viewer)
      if (!entry) return trainingErrors.throw('library_entry_not_found')
      const keys = allRaterKeys(config, club.organizationId, personId)
      const used = await em.count(LibraryUse, { ...scope, entryId, raterKey: { $in: keys } })
      if (used === 0) return trainingErrors.throw('rating_requires_use')
      const existing = await em.findOne(LibraryRating, { ...scope, entryId, raterKey: { $in: keys } })
      if (existing) {
        existing.stars = stars
        existing.updatedAt = new Date()
      } else {
        const key = currentRaterKey(config, club.organizationId, personId)
        em.persist(
          em.create(LibraryRating, {
            ...scope,
            entryId,
            raterKey: key.key,
            raterKeyVersion: key.version,
            raterOrganizationId: club.organizationId,
            stars,
          }),
        )
      }
      await em.flush()
      await recomputeLibraryAggregates(em, scope, [entryId])
      await em.refresh(entry)
      return entry
    },

    async report(em, entryId, reporter, input, viewer) {
      const scope = await requireScope()
      if (!config) return trainingErrors.throw('library_not_configured')
      const entry = await visibleEntry(em, entryId, viewer)
      if (!entry) return trainingErrors.throw('library_entry_not_found')
      const keys =
        'address' in reporter
          ? [publicReporterKey(config, reporter.address).key]
          : allRaterKeys(config, reporter.club.organizationId, reporter.personId)
      if ((await em.count(LibraryReport, { ...scope, entryId, raterKey: { $in: keys } })) > 0) {
        return trainingErrors.throw('library_report_exists')
      }
      const key =
        'address' in reporter
          ? publicReporterKey(config, reporter.address)
          : currentRaterKey(config, reporter.club.organizationId, reporter.personId)
      em.persist(
        em.create(LibraryReport, {
          ...scope,
          entryId,
          raterKey: key.key,
          raterKeyVersion: key.version,
          raterOrganizationId: 'address' in reporter ? null : reporter.club.organizationId,
          reason: input.reason,
          note: input.note,
        }),
      )
      await em.flush()
      const clubs = await reportingClubs(em, scope, entryId)
      const hidden = hiddenByReports(entry.status as 'listed', clubs)
      if (hidden) {
        entry.status = 'hidden_reported'
        entry.updatedAt = new Date()
        await em.flush()
      }
      await recomputeLibraryAggregates(em, scope, [entryId])
      return { entry, hidden }
    },

    async stripAuthorName(em, entryIds) {
      const scope = await requireScope()
      if (entryIds.length === 0) return 0
      const own = new Set(entryIds)
      const adapted = await entriesAdaptedFrom(em, scope, entryIds)
      const rows = await em.find(LibraryEntry, { ...scope, id: { $in: [...new Set([...entryIds, ...adapted])] } })
      let changed = 0
      for (const row of rows) {
        const credit = readCredit(row.credit)
        if (!credit) continue
        const next = withoutAuthorName(credit, { own: own.has(row.id), adaptedFromEntryIds: own })
        if (JSON.stringify(next) === JSON.stringify(credit)) continue
        row.credit = next
        row.updatedAt = new Date()
        changed += 1
      }
      await em.flush()
      return changed
    },

    async eraseRater(em, club, personId) {
      const scope = await requireScope()
      if (!config) return 0
      const keys = allRaterKeys(config, club.organizationId, personId)
      const where = { ...scope, raterKey: { $in: keys } }
      const touched = [
        ...(await em.find(LibraryRating, where, { fields: ['entryId'] })),
        ...(await em.find(LibraryUse, where, { fields: ['entryId'] })),
        ...(await em.find(LibraryReport, where, { fields: ['entryId'] })),
      ].map((row) => row.entryId)
      let rows = 0
      rows += await em.nativeDelete(LibraryRating, where)
      rows += await em.nativeDelete(LibraryUse, where)
      rows += await em.nativeDelete(LibraryReport, where)
      await recomputeLibraryAggregates(em, scope, touched)
      return rows
    },

    async eraseClub(em, club) {
      const scope = await requireScope()
      const own = await em.find(LibraryEntry, { ...scope, sourceOrganizationId: club.organizationId })
      const ownIds = own.map((row) => row.id)
      const where = { ...scope, raterOrganizationId: club.organizationId }
      const touched = [
        ...(await em.find(LibraryRating, where, { fields: ['entryId'] })),
        ...(await em.find(LibraryUse, where, { fields: ['entryId'] })),
        ...(await em.find(LibraryReport, where, { fields: ['entryId'] })),
      ]
        .map((row) => row.entryId)
        .filter((id) => !ownIds.includes(id))
      const counts = {
        training_library_ratings: await em.nativeDelete(LibraryRating, where),
        training_library_uses: await em.nativeDelete(LibraryUse, where),
        training_library_reports: await em.nativeDelete(LibraryReport, where),
      }
      const images = await deleteEntries(em, ownIds)
      await recomputeLibraryAggregates(em, scope, touched)
      return {
        tables: [
          { table: 'training_library_entries', rows: ownIds.length },
          ...Object.entries(counts).map(([table, rows]) => ({ table, rows })),
        ],
        images,
      }
    },

    async countClub(em, club) {
      const scope = scopeOrNull()
      if (!scope) return []
      const where = { ...scope, raterOrganizationId: club.organizationId }
      return [
        {
          table: 'training_library_entries',
          rows: await em.count(LibraryEntry, { ...scope, sourceOrganizationId: club.organizationId }),
        },
        { table: 'training_library_ratings', rows: await em.count(LibraryRating, where) },
        { table: 'training_library_uses', rows: await em.count(LibraryUse, where) },
        { table: 'training_library_reports', rows: await em.count(LibraryReport, where) },
      ]
    },

    async reportAsGuest(entryId, address, input) {
      await requireScope()
      await emOf().transactional(async (tx) => {
        await this.report(tx, entryId, { address }, input, { kind: 'public' })
      })
    },

    async moderateNow(entryId, action) {
      await requireScope()
      return emOf().transactional((tx) => this.moderate(tx, entryId, action))
    },

    async moderation(em) {
      const scope = await requireScope()
      return emOf(em).find(
        LibraryEntry,
        { ...scope, deletedAt: null, $or: [{ status: 'hidden_reported' }, { reportCount: { $gt: 0 } }] },
        { orderBy: { reportCount: 'desc', publishedAt: 'desc' } },
      )
    },

    async moderate(em, entryId, action) {
      const scope = await requireScope()
      const row = await em.findOne(LibraryEntry, { ...scope, id: entryId, deletedAt: null })
      if (!row) return null
      if (action === 'restore') {
        // The operator decided the entry stays: its reports are settled and no longer count towards hiding it.
        row.status = 'listed'
        await em.nativeDelete(LibraryReport, { ...scope, entryId })
      } else {
        row.status = 'removed'
      }
      row.updatedAt = new Date()
      await em.flush()
      await recomputeLibraryAggregates(em, scope, [entryId])
      await em.refresh(row)
      return row
    },
  }
}
