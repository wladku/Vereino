// The picture commands of a club event (event photos spec REQ-I01, REQ-I03, REQ-I04, DD-I03, BR-I07; #872), written by
// the event's managers (the club administrator; a coordinator of the event's section, DD-T06):
// - `activities.club_event_files.update`: a picture's description, kind and place in the order. Changing the kind
//   clears the marks and the confirmation. Not undoable (a correction is another edit).
// - `activities.club_event_files.set_people` (undoable): the marked persons of a photo as a set, and the manager's
//   confirmation ("every recognisable person is marked, nobody outside the club is recognisable"; for a graphic, "no
//   person can be recognised"), with who confirmed and when. Marks are club persons only (another club's id answers
//   404). A change of the set without a new confirmation clears it.
// - `activities.club_event_files.publish` / `unpublish` (undoable): the manager's publication. A picture needs its
//   people confirmed to be published (422 `club_event_people_unconfirmed`). Whether it is public is decided on every
//   read (BR-I01), never here.
// - `activities.club_event_files.publish_all` (undoable): publishes every confirmed draft picture and reports the
//   skipped ones.
// An undo or redo of a picture that was deleted (by staff or by an erasure) or that marks an anonymised person answers
// 409 `club_event_picture_erased` (BR-I07, DD-I13). No events: the audit log records every change.
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { ActingRole } from '@vereino/core'
import { z } from 'zod'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { ClubEvent, ClubEventFile, ClubEventFilePerson } from '../data/entities'
import {
  clubEventPictureUpdateSchema,
  clubEventPicturePeopleSchema,
  clubEventPictureRefSchema,
  clubEventPicturesPublishAllSchema,
} from '../data/validators'
import {
  isPictureKind,
  pictureDescriptionOf,
  reorderedPositions,
  type ClubEventPictureKind,
} from '../lib/club-event-files'
import { peopleConfirmed } from '../lib/public-pictures'
import { CLUB_EVENT_MANAGE_KINDS, clubEventTarget } from '../services/club-event-scope'
import { markedPersonIds } from '../services/club-event-pictures'
import { findPersons } from '../services/directory'
import { assertClubEventOpen } from './club-events'
import { CLUB_EVENT_FILE_RESOURCE_KIND, assertPictureNotErased, type FileTarget } from './club-event-files'
import { activitiesLog, inWriteTransaction, selfPersonId, trustedTenantId } from './shared'

type Scope = { tenantId: string; organizationId: string }

const scopeOf = (row: Scope): Scope => ({ tenantId: row.tenantId, organizationId: row.organizationId })

/** What a picture command records: the picture's publication, confirmation and marks before or after. */
export type PictureSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  clubEventId: string
  kind: ClubEventPictureKind
  description: string
  position: number
  personIds: string[]
  peopleConfirmedAt: string | null
  peopleConfirmedByPersonId: string | null
  publishedAt: string | null
  publishedByPersonId: string | null
}

export type PictureCommandResult = {
  entity: ClubEventFile
  actingRole: ActingRole
  before: PictureSnapshot | null
  after: PictureSnapshot
}

function snapshotOf(file: ClubEventFile, personIds: readonly string[]): PictureSnapshot {
  return {
    id: file.id,
    tenantId: file.tenantId,
    organizationId: file.organizationId,
    clubEventId: file.clubEventId,
    kind: file.kind as ClubEventPictureKind,
    description: file.description ?? '',
    position: file.position,
    personIds: [...personIds],
    peopleConfirmedAt: file.peopleConfirmedAt?.toISOString() ?? null,
    peopleConfirmedByPersonId: file.peopleConfirmedByPersonId ?? null,
    publishedAt: file.publishedAt?.toISOString() ?? null,
    publishedByPersonId: file.publishedByPersonId ?? null,
  }
}

async function snapshot(em: EntityManager, file: ClubEventFile): Promise<PictureSnapshot> {
  return snapshotOf(file, await markedPersonIds(em, scopeOf(file), file.id))
}

/** A live picture of a live club event; the event row is locked first, then the picture. */
function pictureSpec<TSchema extends z.ZodType<{ clubEventId: string; id: string }>>(
  ctx: CommandRuntimeContext,
  input: TSchema,
): AuthorizeScopedSpec<TSchema, FileTarget> {
  return {
    input,
    resourceKind: CLUB_EVENT_FILE_RESOURCE_KIND,
    allowedKinds: CLUB_EVENT_MANAGE_KINDS,
    loadTarget: async (parsed, em, lock: TargetLock) => {
      const tenantId = trustedTenantId(ctx)
      if (!tenantId) return null
      const event = await em.findOne(ClubEvent, { id: parsed.clubEventId, tenantId, deletedAt: null }, lock)
      if (!event) return null
      const file = await em.findOne(
        ClubEventFile,
        {
          id: parsed.id,
          tenantId,
          organizationId: event.organizationId,
          clubEventId: event.id,
          kind: { $in: ['photo', 'graphic'] },
          deletedAt: null,
        },
        lock,
      )
      return file ? { updatedAt: file.updatedAt, file, event } : null
    },
    resolveTarget: (_parsed, entity) => clubEventTarget((entity as FileTarget).event),
  }
}

/** The replay of a picture command: the picture must still exist (BR-I07), then it is authorized like the write. */
async function authorizePictureReplay(
  ctx: CommandRuntimeContext,
  snap: PictureSnapshot | null | undefined,
): Promise<FileTarget & { actingRole: ActingRole; em: EntityManager }> {
  const em = ctx.transactionalEm
  if (!em || !snap?.id || !snap.clubEventId) {
    throw new Error('[internal] club event picture replay needs the replay transaction and the ids')
  }
  await assertPictureNotErased(em, ctx, snap)
  const authorized = await authorizeScoped(
    pictureSpec(ctx, z.object({ clubEventId: z.uuid(), id: z.uuid() })),
    { clubEventId: snap.clubEventId, id: snap.id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return { ...(authorized.entity as FileTarget), actingRole: authorized.actingRole, em }
}

/**
 * The club persons among `ids`: 404 like an unknown id for one that is not a live person of the club, 409
 * `club_event_picture_erased` for an anonymised one on a replay.
 */
async function assertClubPersons(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: Scope,
  ids: readonly string[],
  replay = false,
): Promise<void> {
  if (ids.length === 0) return
  const found = await findPersons(ctx.container, scope, ids, em)
  for (const id of ids) {
    const person = found.get(id)
    if (person?.anonymized && replay) await activitiesErrors.throw('club_event_picture_erased')
    // Like an unknown id (#628): a person of another club is never confirmed to exist.
    if (!person || person.anonymized) throw new CrudHttpError(404, { error: 'Not found' })
  }
}

/** Replaces the marks of `file` with `personIds` (as a set, in the given order). */
async function writeMarks(
  em: EntityManager,
  file: ClubEventFile,
  personIds: readonly string[],
  byPersonId: string | null,
): Promise<void> {
  const scope = scopeOf(file)
  await em.nativeDelete(ClubEventFilePerson, { ...scope, fileId: file.id })
  const now = Date.now()
  ;[...new Set(personIds)].forEach((personId, index) => {
    em.persist(
      em.create(ClubEventFilePerson, {
        ...scope,
        fileId: file.id,
        personId,
        createdByPersonId: byPersonId,
        // Distinct instants keep the mark order on read.
        createdAt: new Date(now + index),
      }),
    )
  })
}

/** Puts the confirmation and publication of a snapshot back on the picture, and its marks. */
async function restore(em: EntityManager, file: ClubEventFile, snap: PictureSnapshot): Promise<void> {
  const date = (value: string | null) => (value ? new Date(value) : null)
  file.peopleConfirmedAt = date(snap.peopleConfirmedAt)
  file.peopleConfirmedByPersonId = snap.peopleConfirmedByPersonId
  file.publishedAt = date(snap.publishedAt)
  file.publishedByPersonId = snap.publishedByPersonId
  file.updatedAt = new Date()
  await writeMarks(em, file, snap.personIds, null)
  await em.flush()
}

function pictureLog(result: PictureCommandResult, labelKey: string, fallback: string) {
  return activitiesLog({
    result,
    resourceKind: CLUB_EVENT_FILE_RESOURCE_KIND,
    labelKey,
    fallback,
    after: result.after,
    parent: { resourceKind: 'activities.club_event', resourceId: result.entity.clubEventId },
  })
}

const updatePictureCommand: CommandHandler<Record<string, unknown>, PictureCommandResult> = {
  id: 'activities.club_event_files.update',
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'activities.club_event_files.update', async (em) => {
      const authorized = await authorizeScoped(pictureSpec(ctx, clubEventPictureUpdateSchema), rawInput, ctx, em)
      const { file, event } = authorized.entity as FileTarget
      await assertClubEventOpen(event)
      const input = authorized.parsed
      const before = await snapshot(em, file)
      if (input.description !== undefined) {
        const checked = pictureDescriptionOf(file.kind, input.description)
        if (!checked.valid) {
          await activitiesErrors.throw('club_event_picture_description_invalid', { field: 'description' })
        } else file.description = checked.name
      }
      if (input.kind !== undefined && input.kind !== file.kind) {
        file.kind = input.kind
        file.peopleConfirmedAt = null
        file.peopleConfirmedByPersonId = null
        await writeMarks(em, file, [], null)
      }
      if (input.position !== undefined) {
        const live = await em.find(
          ClubEventFile,
          { ...scopeOf(file), clubEventId: file.clubEventId, kind: { $in: ['photo', 'graphic'] }, deletedAt: null },
          { orderBy: { position: 'asc', createdAt: 'asc', id: 'asc' } },
        )
        const changes = reorderedPositions(live, file.id, input.position)
        for (const row of live) {
          const position = changes.get(row.id)
          if (position === undefined) continue
          row.position = position
          if (row.id !== file.id) row.updatedAt = new Date()
        }
      }
      file.updatedAt = new Date()
      await em.flush()
      return { entity: file, actingRole: authorized.actingRole, before, after: await snapshot(em, file) }
    })
  },
  buildLog: ({ result }) => pictureLog(result, 'activities.audit.clubEventPictures.update', 'Edit a picture'),
}

const setPeopleCommand: CommandHandler<Record<string, unknown>, PictureCommandResult> = {
  id: 'activities.club_event_files.set_people',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'activities.club_event_files.set_people', async (em) => {
      const authorized = await authorizeScoped(pictureSpec(ctx, clubEventPicturePeopleSchema), rawInput, ctx, em)
      const { file, event } = authorized.entity as FileTarget
      await assertClubEventOpen(event)
      const { personIds: raw, confirmed } = authorized.parsed
      const personIds = [...new Set(raw)]
      if (file.kind === 'graphic' && personIds.length > 0) {
        await activitiesErrors.throw('club_event_graphic_has_no_people', { field: 'personIds' })
      }
      if (file.kind === 'photo' && confirmed && personIds.length === 0) {
        await activitiesErrors.throw('club_event_photo_unmarked', { field: 'personIds' })
      }
      // A replayed redo (`execute` from the audit route) must not bring an anonymised person back (BR-I07).
      await assertClubPersons(ctx, em, scopeOf(file), personIds, ctx.replayTransactionGuard !== undefined)
      const before = await snapshot(em, file)
      const caller = selfPersonId(authorized.scope)
      await writeMarks(em, file, personIds, caller)
      file.peopleConfirmedAt = confirmed ? new Date() : null
      file.peopleConfirmedByPersonId = confirmed ? caller : null
      file.updatedAt = new Date()
      await em.flush()
      return { entity: file, actingRole: authorized.actingRole, before, after: await snapshot(em, file) }
    })
  },
  buildLog: ({ result }) =>
    pictureLog(result, 'activities.audit.clubEventPictures.setPeople', 'Mark the people on a picture'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePictureReplay(ctx, logEntry.snapshotAfter as PictureSnapshot | null)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as PictureSnapshot | null
    const { file, em } = await authorizePictureReplay(ctx, before)
    if (!before) return
    await assertClubPersons(ctx, em, scopeOf(file), before.personIds, true)
    await restore(em, file, {
      ...before,
      publishedAt: file.publishedAt?.toISOString() ?? null,
      publishedByPersonId: file.publishedByPersonId ?? null,
    })
  },
}

/** Publishes `file` (422 `club_event_people_unconfirmed` when its people are not confirmed). */
async function publishOne(em: EntityManager, file: ClubEventFile, byPersonId: string | null): Promise<void> {
  const personIds = await markedPersonIds(em, scopeOf(file), file.id)
  const facts = {
    kind: file.kind as ClubEventPictureKind,
    publishedAt: null,
    peopleConfirmedAt: file.peopleConfirmedAt ?? null,
    personIds,
  }
  if (!peopleConfirmed(facts)) await activitiesErrors.throw('club_event_people_unconfirmed')
  if (file.publishedAt) return
  file.publishedAt = new Date()
  file.publishedByPersonId = byPersonId
  file.updatedAt = new Date()
}

function publicationCommand(
  id: 'activities.club_event_files.publish' | 'activities.club_event_files.unpublish',
): CommandHandler<Record<string, unknown>, PictureCommandResult> {
  const publish = id === 'activities.club_event_files.publish'
  return {
    id,
    isUndoable: true,
    atomicReplay: true,
    async execute(rawInput, ctx) {
      return inWriteTransaction(ctx, id, async (em) => {
        const authorized = await authorizeScoped(pictureSpec(ctx, clubEventPictureRefSchema), rawInput, ctx, em)
        const { file, event } = authorized.entity as FileTarget
        const before = await snapshot(em, file)
        if (publish) {
          await assertClubEventOpen(event)
          await publishOne(em, file, selfPersonId(authorized.scope))
        } else if (file.publishedAt) {
          // Unpublishing stays possible on a cancelled event: it only hides a picture.
          file.publishedAt = null
          file.publishedByPersonId = null
          file.updatedAt = new Date()
        }
        await em.flush()
        return { entity: file, actingRole: authorized.actingRole, before, after: await snapshot(em, file) }
      })
    },
    buildLog: ({ result }) =>
      pictureLog(
        result,
        publish ? 'activities.audit.clubEventPictures.publish' : 'activities.audit.clubEventPictures.unpublish',
        publish ? 'Publish a picture' : 'Unpublish a picture',
      ),
    async authorizeReplay({ ctx, logEntry }) {
      await authorizePictureReplay(ctx, logEntry.snapshotAfter as PictureSnapshot | null)
    },
    /** Puts the publication back as it was; the marks and the confirmation stay as they are now. */
    async undo({ ctx, logEntry }) {
      const before = logEntry.snapshotBefore as PictureSnapshot | null
      const { file, em } = await authorizePictureReplay(ctx, before)
      if (!before) return
      file.publishedAt = before.publishedAt ? new Date(before.publishedAt) : null
      file.publishedByPersonId = before.publishedByPersonId
      file.updatedAt = new Date()
      await em.flush()
    },
  }
}

export type PublishAllResult = {
  event: ClubEvent
  actingRole: ActingRole
  publishedIds: string[]
  skippedIds: string[]
}

const publishAllCommand: CommandHandler<Record<string, unknown>, PublishAllResult> = {
  id: 'activities.club_event_files.publish_all',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'activities.club_event_files.publish_all', async (em) => {
      const spec: AuthorizeScopedSpec<typeof clubEventPicturesPublishAllSchema, ClubEvent> = {
        input: clubEventPicturesPublishAllSchema,
        resourceKind: CLUB_EVENT_FILE_RESOURCE_KIND,
        allowedKinds: CLUB_EVENT_MANAGE_KINDS,
        loadTarget: (parsed, txEm, lock) => {
          const tenantId = trustedTenantId(ctx)
          if (!tenantId) return Promise.resolve(null)
          return txEm.findOne(ClubEvent, { id: parsed.clubEventId, tenantId, deletedAt: null }, lock)
        },
        resolveTarget: (_parsed, entity) => clubEventTarget(entity as ClubEvent),
        lock: 'none',
      }
      const authorized = await authorizeScoped(spec, rawInput, ctx, em)
      const event = authorized.entity as ClubEvent
      await assertClubEventOpen(event)
      const drafts = await em.find(
        ClubEventFile,
        {
          ...scopeOf(event),
          clubEventId: event.id,
          kind: { $in: ['photo', 'graphic'] },
          deletedAt: null,
          publishedAt: null,
        },
        { orderBy: { position: 'asc', id: 'asc' } },
      )
      const by = selfPersonId(authorized.scope)
      const publishedIds: string[] = []
      const skippedIds: string[] = []
      for (const file of drafts) {
        const personIds = await markedPersonIds(em, scopeOf(file), file.id)
        const facts = {
          kind: file.kind as ClubEventPictureKind,
          publishedAt: null,
          peopleConfirmedAt: file.peopleConfirmedAt ?? null,
          personIds,
        }
        if (!peopleConfirmed(facts)) {
          skippedIds.push(file.id)
          continue
        }
        file.publishedAt = new Date()
        file.publishedByPersonId = by
        file.updatedAt = new Date()
        publishedIds.push(file.id)
      }
      await em.flush()
      return { event, actingRole: authorized.actingRole, publishedIds, skippedIds }
    })
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result: { entity: result.event, actingRole: result.actingRole, before: null },
      resourceKind: 'activities.club_event',
      labelKey: 'activities.audit.clubEventPictures.publishAll',
      fallback: 'Publish all pictures of a club event',
      after: { publishedIds: result.publishedIds, skippedIds: result.skippedIds, clubEventId: result.event.id },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    const after = logEntry.snapshotAfter as { clubEventId?: string } | null
    const em = ctx.transactionalEm
    if (!em || !after?.clubEventId) throw new Error('[internal] publish-all replay needs the transaction and the event')
    await authorizeScoped(
      {
        input: z.object({ clubEventId: z.uuid() }),
        resourceKind: CLUB_EVENT_FILE_RESOURCE_KIND,
        allowedKinds: CLUB_EVENT_MANAGE_KINDS,
        loadTarget: (parsed, txEm, lock) => {
          const tenantId = trustedTenantId(ctx)
          if (!tenantId) return Promise.resolve(null)
          return txEm.findOne(ClubEvent, { id: parsed.clubEventId, tenantId, deletedAt: null }, lock)
        },
        resolveTarget: (_parsed, entity) => clubEventTarget(entity as ClubEvent),
        lock: 'none',
      },
      { clubEventId: after.clubEventId },
      ctx,
      em,
      { mode: 'replay' },
    )
  },
  /** Unpublishes the pictures this command published that are still live and published. */
  async undo({ ctx, logEntry }) {
    const after = logEntry.snapshotAfter as { clubEventId?: string; publishedIds?: string[] } | null
    const em = ctx.transactionalEm as EntityManager
    const tenantId = trustedTenantId(ctx)
    if (!after?.publishedIds?.length || !tenantId) return
    const rows = await em.find(ClubEventFile, {
      tenantId,
      id: { $in: after.publishedIds },
      clubEventId: after.clubEventId,
      deletedAt: null,
    })
    for (const row of rows) {
      if (!isPictureKind(row.kind) || !row.publishedAt) continue
      row.publishedAt = null
      row.publishedByPersonId = null
      row.updatedAt = new Date()
    }
    await em.flush()
  },
}

registerCommand(updatePictureCommand)
registerCommand(setPeopleCommand)
registerCommand(publicationCommand('activities.club_event_files.publish'))
registerCommand(publicationCommand('activities.club_event_files.unpublish'))
registerCommand(publishAllCommand)
