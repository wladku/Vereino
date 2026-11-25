// The shared library commands (training outlines spec phase 4, *API, Command, and Error Contracts*, DD-O10…DD-O14,
// BR-O4…BR-O6; REQ-O11…REQ-O15; E24-S05, #685). Every write to the library tenant goes through `trainingLibrary`
// (DD-O10a); the club side is checked here with the caller's grants:
// - `training.library.publish` — publishes (or re-publishes) an outline at `clubs` or `public`, up to the club's
//   widest level (403 `visibility_above_club_level`); the author's name only with their name consent; the publisher
//   accepts the library terms at the first publication (409 `library_terms_required`). The images are copied into the
//   library tenant with their metadata stripped.
// - `training.library.withdraw` — deletes the entry with its ratings, uses and reports.
// - `training.library.copy` — a library entry becomes the caller's own outline, keeping the first author's credit.
// - `training.library.rate` / `training.library.report` — one rating (after a use) and one report per coach.
// - Jobs: `record_uses` (a closed session whose outline came from the library), `apply_level` (the club lowered its
//   level, BR-O5), `strip_author` (the author withdrew the name consent).
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { authorizeScoped, foundationErrors, prefetchSessionScope, trustedScopeOf } from '@/modules/foundation'
import { trainingErrors } from '../api/errors'
import { Outline, OutlineAuthor } from '../data/entities'
import {
  applyLevelSchema,
  copySchema,
  publishSchema,
  rateSchema,
  recordUsesSchema,
  reportSchema,
  stripAuthorSchema,
  withdrawSchema,
} from '../data/validators'
import {
  LIBRARY_TERMS_VERSION,
  buildCredit,
  clubPartsOf,
  librarySnapshot,
  originOf,
  readLevel,
  readOrigin,
  visibilityAllowed,
  type LibraryParts,
  type PublishVisibility,
} from '../lib/library'
import { OUTLINE_PARTS, outlineImages, readParts, type OutlineImageRef } from '../lib/outline'
import {
  clubLibraryLevel,
  clubName,
  findOccurrence,
  findPublicNames,
  groupLeadersOn,
  type TrainingScope,
} from '../services/directory'
import { readOutlineImage } from '../services/images'
import { TRAINING_LIBRARY, type LibraryViewer, type TrainingLibrary } from '../services/library'
import { stripAuthorIn } from '../services/library-club'
import { attachmentServiceOf } from './images'
import { OUTLINE_IMAGE_OWNER_ENTITY, OUTLINE_IMAGE_PARTITION } from '../lib/images'
import {
  OUTLINE_KINDS,
  OUTLINE_RESOURCE_KIND,
  contentOf,
  inWriteTransaction,
  outlineLoader,
  outlineTarget,
  selfPersonId,
} from './shared'

export const LIBRARY_RESOURCE_KIND = 'training.library_entry'

export function libraryOf(ctx: CommandRuntimeContext): TrainingLibrary {
  return ctx.container.resolve<TrainingLibrary>(TRAINING_LIBRARY)
}

const scopeOf = (row: { tenantId: string; organizationId: string }): TrainingScope => ({
  tenantId: row.tenantId,
  organizationId: row.organizationId,
})

/** The audit entry of a library command: in the club's tenant, naming the entry (never the library scope). */
async function libraryLog(args: {
  club: TrainingScope
  entryId: string
  actingRole: ActingRole
  labelKey: string
  fallback: string
  after: Record<string, unknown> | null
  before?: Record<string, unknown> | null
}) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(args.labelKey, args.fallback),
    resourceKind: LIBRARY_RESOURCE_KIND,
    resourceId: args.entryId,
    tenantId: args.club.tenantId,
    organizationId: args.club.organizationId,
    snapshotBefore: args.before ?? null,
    snapshotAfter: args.after,
    context: { actingRole: args.actingRole },
  }
}

/** The spec of a command on one outline of the club the caller may edit (its author, a coach, a coordinator, the admin). */
function outlineSpec<TSchema extends typeof publishSchema | typeof withdrawSchema>(
  ctx: CommandRuntimeContext,
  input: TSchema,
) {
  return {
    input,
    resourceKind: OUTLINE_RESOURCE_KIND,
    allowedKinds: OUTLINE_KINDS,
    loadTarget: (parsed: { id: string }, em: EntityManager, lock: Parameters<ReturnType<typeof outlineLoader>>[2]) =>
      outlineLoader(ctx)(em, parsed.id, lock),
    resolveTarget: (_parsed: unknown, row: Outline | null) => outlineTarget(row as Outline),
    // Publishing reads the outline; it does not edit its content, so an editor open elsewhere keeps its version.
    lock: 'none' as const,
  }
}

/**
 * A command whose target is the caller (copy, rate, report): any grant matches its own person, so the scope check
 * needs a linked person — the rater key and an outline's author are that person.
 */
async function authorizeSelf<TSchema extends typeof copySchema | typeof rateSchema | typeof reportSchema>(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  input: TSchema,
  rawInput: unknown,
  sessionScope: Awaited<ReturnType<typeof prefetchSessionScope>>,
) {
  const self = sessionScope ? selfPersonId(sessionScope.scope) : null
  const authorized = await authorizeScoped(
    {
      input,
      resourceKind: LIBRARY_RESOURCE_KIND,
      allowedKinds: OUTLINE_KINDS,
      resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope, personId: self }),
      lock: 'none',
    },
    rawInput,
    ctx,
    em,
    { sessionScope },
  )
  const personId = selfPersonId(authorized.scope)
  if (!personId) return foundationErrors.throw('scope_unlinked')
  return {
    authorized,
    parsed: authorized.parsed as unknown as z.output<TSchema>,
    personId,
    club: { tenantId: authorized.tenantId, organizationId: authorized.organizationId },
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Publish and withdraw

export type PublishResult = {
  entryId: string
  visibility: PublishVisibility
  club: TrainingScope
  outlineId: string
  actingRole: ActingRole
  republished: boolean
}

const publishCommand: CommandHandler<Record<string, unknown>, PublishResult> = {
  id: 'training.library.publish',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const library = libraryOf(ctx)
    await library.requireScope()
    // 1. The checks, the terms and the images to copy (the uploads are their own transactions).
    const prepared = await inWriteTransaction(ctx, 'training.library.publish.check', async (em) => {
      const authorized = await authorizeScoped(outlineSpec(ctx, publishSchema), rawInput, ctx, em)
      const row = authorized.entity as Outline
      const club = scopeOf(row)
      const { visibility, acceptTerms } = authorized.parsed
      if (!visibilityAllowed(visibility, readLevel(await clubLibraryLevel(ctx.container, club)))) {
        return trainingErrors.throw('visibility_above_club_level')
      }
      const publisher = selfPersonId(authorized.scope)
      if (!publisher) return foundationErrors.throw('scope_unlinked')
      const accepted = await em.count(OutlineAuthor, {
        ...club,
        personId: publisher,
        termsVersion: LIBRARY_TERMS_VERSION,
        deletedAt: null,
      })
      if (accepted === 0) {
        if (acceptTerms !== true) return trainingErrors.throw('library_terms_required')
        em.persist(
          em.create(OutlineAuthor, {
            ...club,
            personId: publisher,
            termsVersion: LIBRARY_TERMS_VERSION,
            acceptedAt: new Date(),
          }),
        )
        await em.flush()
      }
      const existing = await library.publishedEntry(em, club, row.id)
      return {
        club,
        outlineId: row.id,
        visibility,
        actingRole: authorized.actingRole,
        entryId: existing?.id ?? randomUUID(),
        republished: Boolean(existing),
        images: outlineImages(readParts(row.parts)),
      }
    })
    const auth = {
      sub: 'training:library-publish',
      tenantId: prepared.club.tenantId,
      orgId: prepared.club.organizationId,
      roles: [],
    }
    const files = await Promise.all(prepared.images.map((image) => readOutlineImage(ctx.container, auth, image)))
    const uploaded = await library.uploadImages(prepared.entryId, files)
    const kept: OutlineImageRef[] = prepared.images.filter((_image, index) => uploaded[index] !== null)
    const keptIds = uploaded.filter((id): id is string => id !== null)
    // 2. The snapshot, built again from the outline as it is now, and the entry.
    let replaced: string[] = []
    try {
      await inWriteTransaction(ctx, 'training.library.publish', async (em) => {
        const row = await em.findOne(Outline, { id: prepared.outlineId, ...prepared.club, deletedAt: null })
        if (!row) return foundationErrors.throw('scope_denied')
        const names = await findPublicNames(ctx.container, prepared.club, [row.authorPersonId], em)
        const credit = buildCredit({
          clubName: (await clubName(ctx.container, prepared.club)) ?? '',
          authorName: names.get(row.authorPersonId) ?? null,
          origin: readOrigin(row.originCredit),
        })
        const result = await library.publish(
          em,
          {
            club: prepared.club,
            outlineId: row.id,
            visibility: prepared.visibility,
            snapshot: librarySnapshot(contentOf(row), kept),
            credit,
            images: keptIds,
          },
          prepared.entryId,
        )
        replaced = result.replacedImages
        row.publishedEntryId = result.entry.id
        row.publishedVisibility = prepared.visibility
        await em.flush()
        return true
      })
    } catch (error: unknown) {
      await library.releaseImages(prepared.entryId, keptIds)
      throw error
    }
    await library.releaseImages(prepared.entryId, replaced)
    return {
      entryId: prepared.entryId,
      visibility: prepared.visibility,
      club: prepared.club,
      outlineId: prepared.outlineId,
      actingRole: prepared.actingRole,
      republished: prepared.republished,
    }
  },
  buildLog: ({ result }) =>
    libraryLog({
      club: result.club,
      entryId: result.entryId,
      actingRole: result.actingRole,
      labelKey: 'training.audit.library.publish',
      fallback: 'Share a training outline in the library',
      after: { outlineId: result.outlineId, visibility: result.visibility, republished: result.republished },
    }),
}

export type WithdrawResult = { entryId: string; club: TrainingScope; outlineId: string; actingRole: ActingRole }

/** Withdraws entries in `em`: deletes them and clears the club outlines that point at them; returns the images. */
async function withdrawEntries(
  library: TrainingLibrary,
  em: EntityManager,
  club: TrainingScope,
  entryIds: readonly string[],
): Promise<Map<string, string[]>> {
  const images = await library.deleteEntries(em, entryIds)
  if (entryIds.length > 0) {
    await em.nativeUpdate(
      Outline,
      { ...club, publishedEntryId: { $in: [...entryIds] } },
      { publishedEntryId: null, publishedVisibility: null },
    )
  }
  return images
}

async function releaseAll(library: TrainingLibrary, images: Map<string, string[]>): Promise<void> {
  for (const [entryId, ids] of images) await library.releaseImages(entryId, ids)
}

const withdrawCommand: CommandHandler<Record<string, unknown>, WithdrawResult> = {
  id: 'training.library.withdraw',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const library = libraryOf(ctx)
    await library.requireScope()
    const box: { images: Map<string, string[]> } = { images: new Map() }
    const result = await inWriteTransaction(ctx, 'training.library.withdraw', async (em) => {
      const authorized = await authorizeScoped(outlineSpec(ctx, withdrawSchema), rawInput, ctx, em)
      const row = authorized.entity as Outline
      const club = scopeOf(row)
      const entry = await library.publishedEntry(em, club, row.id)
      if (!entry) return trainingErrors.throw('outline_not_published')
      box.images = await withdrawEntries(library, em, club, [entry.id])
      return { entryId: entry.id, club, outlineId: row.id, actingRole: authorized.actingRole }
    })
    await releaseAll(library, box.images)
    return result
  },
  buildLog: ({ result }) =>
    libraryLog({
      club: result.club,
      entryId: result.entryId,
      actingRole: result.actingRole,
      labelKey: 'training.audit.library.withdraw',
      fallback: 'Withdraw a training outline from the library',
      after: null,
      before: { outlineId: result.outlineId },
    }),
}

// ---------------------------------------------------------------------------------------------------------------------
// Copy, rate, report

export type CopyResult = { entity: Outline; entryId: string; actingRole: ActingRole }

/**
 * Copies the entry's images into the club as files of the new outline (owner assignment only), each set on the
 * exercises that showed it, one upload transaction per image; an image that cannot be read is left out.
 */
async function copyImages(
  ctx: CommandRuntimeContext,
  library: TrainingLibrary,
  club: TrainingScope,
  outlineId: string,
  entryId: string,
  parts: LibraryParts,
  viewer: LibraryViewer,
): Promise<number> {
  const used = [
    ...new Set(
      OUTLINE_PARTS.flatMap((part) =>
        parts[part].flatMap((exercise) => (exercise.image === null ? [] : [exercise.image])),
      ),
    ),
  ]
  let copied = 0
  for (const index of used) {
    const file = await library.readImage(entryId, index, viewer)
    if (!file) continue
    await attachmentServiceOf(ctx).createScoped({
      ...club,
      entityId: OUTLINE_IMAGE_OWNER_ENTITY,
      recordId: outlineId,
      partitionCode: OUTLINE_IMAGE_PARTITION,
      fileName: file.fileName,
      declaredMimeType: file.mimeType,
      buffer: file.buffer,
      persistLink: async (tx, attachmentId) => {
        const row = await tx.findOne(Outline, { id: outlineId, ...club, deletedAt: null })
        if (!row) return
        const current = readParts(row.parts)
        const ref: OutlineImageRef = { attachmentId, ownerOutlineId: outlineId }
        const next = { ...current }
        for (const part of OUTLINE_PARTS) {
          next[part] = current[part].map((exercise, position) =>
            parts[part][position]?.image === index ? { ...exercise, image: ref } : exercise,
          )
        }
        row.parts = next
        row.updatedAt = new Date()
        await tx.flush()
      },
    })
    copied += 1
  }
  return copied
}

const copyCommand: CommandHandler<Record<string, unknown>, CopyResult> = {
  id: 'training.library.copy',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const library = libraryOf(ctx)
    await library.requireScope()
    const sessionScope = await prefetchSessionScope(ctx)
    const box: { parts?: LibraryParts; viewer?: LibraryViewer } = {}
    const result = await inWriteTransaction(ctx, 'training.library.copy', async (em) => {
      const { authorized, parsed, personId, club } = await authorizeSelf(ctx, em, copySchema, rawInput, sessionScope)
      const viewer: LibraryViewer = { kind: 'club', organizationId: club.organizationId, personId }
      const found = await library.snapshotOf(parsed.entryId, viewer, em)
      if (!found) return trainingErrors.throw('library_entry_not_found')
      const { entry, parts, credit } = found
      const now = new Date()
      const row = em.create(Outline, {
        id: randomUUID(),
        ...club,
        createdAt: now,
        updatedAt: now,
        authorPersonId: personId,
        sectionId: null,
        groupId: null,
        activityId: null,
        occurrenceId: null,
        sourceOutlineId: null,
        originEntryId: entry.id,
        originCredit: originOf(entry.id, credit) as unknown as Record<string, unknown>,
        language: entry.language === 'en' ? 'en' : 'pl',
        topic: entry.topic,
        goal: entry.goal,
        specificGoals: entry.specificGoals,
        ageCategory: entry.ageCategory,
        durationMinutes: entry.durationMinutes,
        playersCount: entry.playersCount ?? null,
        equipment: entry.equipment,
        parts: clubPartsOf(parts, () => null),
      })
      em.persist(row)
      await em.flush()
      box.parts = parts
      box.viewer = viewer
      return { entity: row, entryId: entry.id, actingRole: authorized.actingRole }
    })
    if (box.parts && box.viewer) {
      await copyImages(ctx, library, scopeOf(result.entity), result.entity.id, result.entryId, box.parts, box.viewer)
      const fresh = await ctx.container
        .resolve<EntityManager>('em')
        .fork()
        .findOne(Outline, { id: result.entity.id, ...scopeOf(result.entity) })
      if (fresh) result.entity = fresh
    }
    return result
  },
  buildLog: ({ result }) =>
    libraryLog({
      club: scopeOf(result.entity),
      entryId: result.entryId,
      actingRole: result.actingRole,
      labelKey: 'training.audit.library.copy',
      fallback: 'Copy a training outline from the library',
      after: { outlineId: result.entity.id },
    }),
}

export type RateResult = {
  entryId: string
  stars: number
  club: TrainingScope
  actingRole: ActingRole
  averageRating: number | null
  ratingCount: number
}

const rateCommand: CommandHandler<Record<string, unknown>, RateResult> = {
  id: 'training.library.rate',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const library = libraryOf(ctx)
    await library.requireScope()
    const sessionScope = await prefetchSessionScope(ctx)
    return inWriteTransaction(ctx, 'training.library.rate', async (em) => {
      const { authorized, parsed, personId, club } = await authorizeSelf(ctx, em, rateSchema, rawInput, sessionScope)
      const { entryId, stars } = parsed
      const entry = await library.rate(em, entryId, club, personId, stars)
      return {
        entryId,
        stars,
        club,
        actingRole: authorized.actingRole,
        averageRating: entry.ratingCount > 0 ? Math.round((entry.ratingSum / entry.ratingCount) * 10) / 10 : null,
        ratingCount: entry.ratingCount,
      }
    })
  },
  buildLog: ({ result }) =>
    libraryLog({
      club: result.club,
      entryId: result.entryId,
      actingRole: result.actingRole,
      labelKey: 'training.audit.library.rate',
      fallback: 'Rate a library training outline',
      after: { stars: result.stars },
    }),
}

export type ReportResult = { entryId: string; club: TrainingScope; actingRole: ActingRole; hidden: boolean }

const reportCommand: CommandHandler<Record<string, unknown>, ReportResult> = {
  id: 'training.library.report',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const library = libraryOf(ctx)
    await library.requireScope()
    const sessionScope = await prefetchSessionScope(ctx)
    return inWriteTransaction(ctx, 'training.library.report', async (em) => {
      const { authorized, parsed, personId, club } = await authorizeSelf(ctx, em, reportSchema, rawInput, sessionScope)
      const { entryId, reason, note } = parsed
      const viewer: LibraryViewer = { kind: 'club', organizationId: club.organizationId, personId }
      const { hidden } = await library.report(em, entryId, { club, personId }, { reason, note }, viewer)
      return { entryId, club, actingRole: authorized.actingRole, hidden }
    })
  },
  buildLog: ({ result }) =>
    libraryLog({
      club: result.club,
      entryId: result.entryId,
      actingRole: result.actingRole,
      labelKey: 'training.audit.library.report',
      fallback: 'Report a library training outline',
      after: { hidden: result.hidden },
    }),
}

// ---------------------------------------------------------------------------------------------------------------------
// Jobs (session-less, in the club's scope)

function jobSpec<TSchema extends typeof recordUsesSchema | typeof stripAuthorSchema | typeof applyLevelSchema>(
  input: TSchema,
) {
  return {
    input,
    resourceKind: 'training.organization',
    allowedKinds: ['system_job'] as const,
    resolveTarget: (_parsed: unknown, _entity: unknown, trusted: TrainingScope) => ({
      id: trusted.organizationId,
      ...trusted,
    }),
    lock: 'none' as const,
    scopeSource: { job: true } as const,
  }
}

/** Glossary *Use*: a closed session whose outline came from a library entry — its coach and the group's leaders. */
const recordUsesCommand: CommandHandler<Record<string, unknown>, { recorded: number }> = {
  id: 'training.library.record_uses',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const library = libraryOf(ctx)
    if (!library.config()) return { recorded: 0 }
    return inWriteTransaction(ctx, 'training.library.record_uses', async (em) => {
      const authorized = await authorizeScoped(jobSpec(recordUsesSchema), rawInput, ctx, em)
      const club = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const occurrenceId = authorized.parsed.occurrenceId
      const outline = await em.findOne(Outline, { ...club, occurrenceId, deletedAt: null })
      if (!outline?.originEntryId) return { recorded: 0 }
      const session = await findOccurrence(ctx.container, club, occurrenceId, em)
      if (!session || session.status === 'cancelled') return { recorded: 0 }
      const leaders = await groupLeadersOn(ctx.container, club, session.groupId, session.occurrenceDate, em)
      const persons = [...(session.coachPersonId ? [session.coachPersonId] : []), ...leaders]
      return { recorded: await library.recordUses(em, outline.originEntryId, club, persons) }
    })
  },
}

/** BR-O5: the club lowered its widest level; the entries above it are withdrawn. */
const applyLevelCommand: CommandHandler<Record<string, unknown>, { withdrawn: number }> = {
  id: 'training.library.apply_level',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const library = libraryOf(ctx)
    if (!library.config()) return { withdrawn: 0 }
    const box: { images: Map<string, string[]> } = { images: new Map() }
    const result = await inWriteTransaction(ctx, 'training.library.apply_level', async (em) => {
      const authorized = await authorizeScoped(jobSpec(applyLevelSchema), rawInput, ctx, em)
      const club = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const level = readLevel(await clubLibraryLevel(ctx.container, club))
      const above = await library.entriesAboveLevel(em, club, level)
      box.images = await withdrawEntries(
        library,
        em,
        club,
        above.map((entry) => entry.id),
      )
      return { withdrawn: above.length }
    })
    await releaseAll(library, box.images)
    return result
  },
}

/** REQ-O14: a person without the name consent (withdrawn, or anonymised) is no longer named in the library. */
const stripAuthorCommand: CommandHandler<Record<string, unknown>, { changed: number }> = {
  id: 'training.library.strip_author',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const library = libraryOf(ctx)
    if (!library.config()) return { changed: 0 }
    return inWriteTransaction(ctx, 'training.library.strip_author', async (em) => {
      const authorized = await authorizeScoped(jobSpec(stripAuthorSchema), rawInput, ctx, em)
      const club = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const personId = authorized.parsed.personId
      if ((await findPublicNames(ctx.container, club, [personId], em)).has(personId)) return { changed: 0 }
      return { changed: await stripAuthorIn(library, em, club, personId) }
    })
  },
}

/** The trusted club of a request command (for routes that need it after the command). */
export function clubOf(ctx: CommandRuntimeContext): TrainingScope | null {
  return trustedScopeOf(ctx)
}

registerCommand(publishCommand)
registerCommand(withdrawCommand)
registerCommand(copyCommand)
registerCommand(rateCommand)
registerCommand(reportCommand)
registerCommand(recordUsesCommand)
registerCommand(applyLevelCommand)
registerCommand(stripAuthorCommand)
