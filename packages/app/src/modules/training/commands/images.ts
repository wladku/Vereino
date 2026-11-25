// `training.outlines.images.add|remove` (training outlines spec `/api/training/outlines/[id]/images`; REQ-O06: images
// are uploads only; #683): an image on one exercise of an outline — JPEG, PNG or WebP up to 5 MB (checked by its bytes
// in the route), at most 12 per outline — written by whoever may edit the outline, never on a locked one (BR-O3). The
// bytes go to the platform `attachments` module (private partition) owned by the outline, with the owner assignment
// only, and the exercise's image is set in the upload transaction (`persistLink`) after the outline row is locked
// again; a replaced image is released after the commit when nothing else references it. Both change the outline's
// version, so a client sends its lock token and an editor open elsewhere sees 409. Not undoable (the bytes are not in
// the stored input).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { authorizeScoped, trustedScopeOf } from '@/modules/foundation'
import type { Outline } from '../data/entities'
import { imageRemoveSchema, imageTargetSchema } from '../data/validators'
import { imageFits, OUTLINE_IMAGE_OWNER_ENTITY, OUTLINE_IMAGE_PARTITION } from '../lib/images'
import { readParts, withExerciseImage, withoutImage, type OutlineImageRef, type OutlinePart } from '../lib/outline'
import { findOccurrence } from '../services/directory'
import { releaseUnusedImages } from '../services/images'
import {
  OUTLINE_KINDS,
  OUTLINE_RESOURCE_KIND,
  assertNotLocked,
  inWriteTransaction,
  outlineLoader,
  outlineSnapshot,
  outlineTarget,
  type OutlineSnapshot,
  throwFieldError,
  trainingLog,
  type TrainingCommandResult,
} from './shared'

/** Where the route hands the checked upload to the command (never part of the stored command input). */
const TRAINING_UPLOAD_CONTEXT = Symbol.for('vereino.training.upload')

export type CheckedImage = { buffer: Buffer; fileName: string; mimeType: string }

type UploadContext = CommandRuntimeContext & { [TRAINING_UPLOAD_CONTEXT]?: CheckedImage }

/** The command context carrying a checked upload. */
export function withImage(ctx: CommandRuntimeContext, image: CheckedImage): CommandRuntimeContext {
  return Object.assign(ctx, { [TRAINING_UPLOAD_CONTEXT]: image })
}

function imageOf(ctx: CommandRuntimeContext): CheckedImage {
  const image = (ctx as UploadContext)[TRAINING_UPLOAD_CONTEXT]
  if (!image || !Buffer.isBuffer(image.buffer)) throw new CrudHttpError(400, { error: 'File is required' })
  return image
}

/** The platform attachment service, or 503 when the `attachments` module is not enabled. */
export function attachmentServiceOf(ctx: CommandRuntimeContext): AttachmentService {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  return ctx.container.resolve<AttachmentService>('attachmentService')
}

export type ImageCommandResult = TrainingCommandResult<OutlineSnapshot> & { image: OutlineImageRef | null }

function outlineSpec<TSchema extends typeof imageTargetSchema | typeof imageRemoveSchema>(
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
  }
}

/** The outline, authorized and not locked; 422 when the exercise is missing or the outline holds 12 images already. */
async function writableExercise(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  rawInput: unknown,
  lockTokenChecked: boolean,
) {
  const authorized = await authorizeScoped(
    lockTokenChecked
      ? { ...outlineSpec(ctx, imageTargetSchema), lock: 'none' as const }
      : outlineSpec(ctx, imageTargetSchema),
    rawInput,
    ctx,
    em,
  )
  const row = authorized.entity as Outline
  const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  await assertNotLocked(row.occurrenceId ? await findOccurrence(ctx.container, scope, row.occurrenceId, em) : null)
  const { part, index } = authorized.parsed as { part: OutlinePart; index: number }
  const parts = readParts(row.parts)
  if (index >= parts[part].length) return throwFieldError('outline_exercise_not_found', 'index')
  const exercise = parts[part][index]
  if (!imageFits(parts, exercise.image !== null)) return throwFieldError('outline_images_limit_reached', 'file')
  return { authorized, row, parts, part, index, replaced: exercise.image }
}

const addImageCommand: CommandHandler<Record<string, unknown>, ImageCommandResult> = {
  id: 'training.outlines.images.add',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const image = imageOf(ctx)
    // An early refusal (403, 404, 409, 422) before the bytes are stored; everything repeats under the lock below.
    await inWriteTransaction(ctx, 'training.outlines.images.add.check', async (em) => {
      await writableExercise(ctx, em, rawInput, false)
      return true
    })
    const scope = trustedScopeOf(ctx)
    if (!scope) throw new Error('[internal] outline image upload without a trusted scope')
    const { id } = imageTargetSchema.parse(rawInput)
    const box: { result?: ImageCommandResult; replaced?: OutlineImageRef | null } = {}
    await attachmentServiceOf(ctx).createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: OUTLINE_IMAGE_OWNER_ENTITY,
      recordId: id,
      partitionCode: OUTLINE_IMAGE_PARTITION,
      fileName: image.fileName,
      declaredMimeType: image.mimeType,
      buffer: image.buffer,
      persistLink: async (tx, attachmentId) => {
        // The lock token was compared by the check above; the upload changes the version, so it is not compared twice.
        const { authorized, row, parts, part, index, replaced } = await writableExercise(ctx, tx, rawInput, true)
        const before = outlineSnapshot(row)
        const ref: OutlineImageRef = { attachmentId, ownerOutlineId: row.id }
        row.parts = withExerciseImage(parts, part, index, ref) ?? parts
        row.updatedAt = new Date()
        await tx.flush()
        box.replaced = replaced
        box.result = { entity: row, actingRole: authorized.actingRole, before, image: ref }
      },
    })
    const result = box.result
    if (!result) throw new Error('[internal] the outline image upload produced no result')
    if (box.replaced) await releaseUnusedImages(ctx.container, scope, [box.replaced])
    return result
  },
  buildLog: ({ result }) =>
    trainingLog({
      result,
      labelKey: 'training.audit.outlines.imageAdd',
      fallback: 'Add an image to a training outline',
      after: outlineSnapshot(result.entity),
    }),
}

const removeImageCommand: CommandHandler<Record<string, unknown>, ImageCommandResult> = {
  id: 'training.outlines.images.remove',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const box: { removed: OutlineImageRef | null } = { removed: null }
    const result = await inWriteTransaction(ctx, 'training.outlines.images.remove', async (em) => {
      const authorized = await authorizeScoped(outlineSpec(ctx, imageRemoveSchema), rawInput, ctx, em)
      const row = authorized.entity as Outline
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      await assertNotLocked(row.occurrenceId ? await findOccurrence(ctx.container, scope, row.occurrenceId, em) : null)
      const { attachmentId } = authorized.parsed as { attachmentId: string }
      const parts = readParts(row.parts)
      const before = outlineSnapshot(row)
      const current = before.parts
      const found = [...current.warm_up, ...current.main, ...current.cool_down].find(
        (exercise) => exercise.image?.attachmentId === attachmentId,
      )
      if (!found?.image) throw new CrudHttpError(404, { error: 'Not found' })
      box.removed = found.image
      row.parts = withoutImage(parts, attachmentId)
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before, image: null }
    })
    if (box.removed) await releaseUnusedImages(ctx.container, scopeOf(result.entity), [box.removed])
    return result
  },
  buildLog: ({ result }) =>
    trainingLog({
      result,
      labelKey: 'training.audit.outlines.imageRemove',
      fallback: 'Remove an image from a training outline',
      after: outlineSnapshot(result.entity),
    }),
}

const scopeOf = (row: { tenantId: string; organizationId: string }) => ({
  tenantId: row.tenantId,
  organizationId: row.organizationId,
})

registerCommand(addImageCommand)
registerCommand(removeImageCommand)
