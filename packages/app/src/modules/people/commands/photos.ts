// `people.persons.photo.set` and `people.persons.photo.remove` (people life-cycle spec REQ-L12, *Data Models* →
// `people_persons.photo_attachment_id`, *API* row `/api/people/persons/{id}/photo`; #312): the person's photo, written
// by the club administrator (the routes require `people.manage`). The route checks the format (PNG, JPEG, WebP — no
// SVG) and the size (5 MB) by the file's bytes; the bytes go to the platform `attachments` module through its public
// `attachmentService` (private partition, owner and assignment set, so the scoped read names exactly this file) and
// the pointer is written in the upload transaction (`persistLink`), after the person row is locked again. A new upload
// replaces the pointer; earlier files stay in `attachments`, so the undo of a removal always finds its file.
//
// The photo is a file link, not one of the person form's fields: no lock token is asked, but the row's `updatedAt`
// moves with the pointer, so the person page reads the record again after a change. `set` is not undoable (its bytes
// are not in the stored command input; remove or replace is the compensating action); `remove` is undoable.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec } from '@/modules/foundation'
import type { Person } from '../data/entities'
import { PERSON_PHOTO_ASSIGNMENT, PERSON_PHOTO_OWNER_ENTITY, PERSON_PHOTO_PARTITION } from '../lib/person-photo'
import { inWriteTransaction, loadPersonLocked, personTarget } from './shared'

const RESOURCE_KIND = 'people.person'
const PHOTO_KINDS = ['club_admin'] as const

/** Where the route hands the checked upload to the command (never part of the stored command input). */
const PHOTO_UPLOAD_CONTEXT = Symbol.for('vereino.people.photo_upload')

export type PhotoUpload = { buffer: Buffer; fileName: string; mimeType: string }

type UploadContext = CommandRuntimeContext & { [PHOTO_UPLOAD_CONTEXT]?: PhotoUpload }

/** The command context carrying a checked photo upload. */
export function withPhotoUpload(ctx: CommandRuntimeContext, upload: PhotoUpload): CommandRuntimeContext {
  return Object.assign(ctx, { [PHOTO_UPLOAD_CONTEXT]: upload })
}

function photoUploadOf(ctx: CommandRuntimeContext): PhotoUpload {
  const upload = (ctx as UploadContext)[PHOTO_UPLOAD_CONTEXT]
  if (!upload || !Buffer.isBuffer(upload.buffer)) throw new CrudHttpError(400, { error: 'File is required' })
  return upload
}

export type PhotoSnapshot = { id: string; tenantId: string; organizationId: string; photoAttachmentId: string | null }

export type PhotoCommandResult = { person: Person; actingRole: ActingRole; before: PhotoSnapshot | null }

const personIdSchema = z.object({ id: z.uuid() }).strict()

function photoSnapshot(person: Person): PhotoSnapshot {
  return {
    id: person.id,
    tenantId: person.tenantId,
    organizationId: person.organizationId,
    photoAttachmentId: person.photoAttachmentId ?? null,
  }
}

function photoSpec(ctx: CommandRuntimeContext): AuthorizeScopedSpec<typeof personIdSchema, Person> {
  return {
    input: personIdSchema,
    resourceKind: RESOURCE_KIND,
    allowedKinds: PHOTO_KINDS,
    loadTarget: (parsed, em, lock) => loadPersonLocked(em, ctx, parsed.id, lock),
    resolveTarget: (_parsed, entity) => personTarget(entity as Person),
    lock: 'none',
  }
}

async function authorizePhoto(
  rawInput: unknown,
  ctx: CommandRuntimeContext,
  em: EntityManager,
  mode: 'execute' | 'replay' = 'execute',
) {
  const authorized = await authorizeScoped(photoSpec(ctx), rawInput, ctx, em, { mode })
  return { person: authorized.entity as Person, actingRole: authorized.actingRole }
}

async function photoLog(result: PhotoCommandResult, labelKey: string, fallback: string) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(labelKey, fallback),
    resourceKind: RESOURCE_KIND,
    resourceId: result.person.id,
    tenantId: result.person.tenantId,
    organizationId: result.person.organizationId,
    snapshotBefore: result.before,
    snapshotAfter: photoSnapshot(result.person),
    context: { actingRole: result.actingRole },
  }
}

function attachmentServiceOf(ctx: CommandRuntimeContext): AttachmentService {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  return ctx.container.resolve<AttachmentService>('attachmentService')
}

const setPhotoCommand: CommandHandler<Record<string, unknown>, PhotoCommandResult> = {
  id: 'people.persons.photo.set',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const upload = photoUploadOf(ctx)
    // Refuse early (403, 404) before any byte is stored; the check repeats on the locked row below.
    const probe = await inWriteTransaction(ctx, 'people.persons.photo.set.check', (em) =>
      authorizePhoto(rawInput, ctx, em),
    )
    const scope = trustedScopeOf(ctx)
    if (!scope) throw new Error('[internal] photo upload without a trusted scope')
    const box: { result?: PhotoCommandResult } = {}
    await attachmentServiceOf(ctx).createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: PERSON_PHOTO_OWNER_ENTITY,
      recordId: probe.person.id,
      partitionCode: PERSON_PHOTO_PARTITION,
      fileName: upload.fileName,
      declaredMimeType: upload.mimeType,
      buffer: upload.buffer,
      assignments: [{ type: PERSON_PHOTO_ASSIGNMENT, id: probe.person.id }],
      persistLink: async (tx, attachmentId) => {
        const { person, actingRole } = await authorizePhoto(rawInput, ctx, tx)
        const before = photoSnapshot(person)
        person.photoAttachmentId = attachmentId
        await tx.flush()
        box.result = { person, actingRole, before }
      },
    })
    const result = box.result
    if (!result) throw new Error('[internal] the photo upload produced no result')
    return result
  },
  buildLog: ({ result }) => photoLog(result, 'people.audit.persons.photo.set', 'Upload a person photo'),
}

const removePhotoCommand: CommandHandler<Record<string, unknown>, PhotoCommandResult> = {
  id: 'people.persons.photo.remove',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'people.persons.photo.remove', async (em) => {
      const { person, actingRole } = await authorizePhoto(rawInput, ctx, em)
      const before = photoSnapshot(person)
      person.photoAttachmentId = null
      return { person, actingRole, before }
    })
  },
  buildLog: ({ result }) => photoLog(result, 'people.audit.persons.photo.remove', 'Remove a person photo'),
  async authorizeReplay({ ctx, logEntry }) {
    const em = ctx.transactionalEm
    if (!em || !logEntry.resourceId) throw new Error('[internal] photo replay needs the replay transaction')
    await authorizePhoto({ id: logEntry.resourceId }, ctx, em, 'replay')
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as PhotoSnapshot | null | undefined
    const em = ctx.transactionalEm
    if (!em || !before?.id) throw new Error('[internal] missing photo snapshot for undo')
    const { person } = await authorizePhoto({ id: before.id }, ctx, em, 'replay')
    person.photoAttachmentId = before.photoAttachmentId
    await em.flush()
  },
}

registerCommand(setPhotoCommand)
registerCommand(removePhotoCommand)
