// The reads and deletions of club event pictures (event photos spec REQ-I04, REQ-I05, REQ-I06, REQ-I10, BR-I01, DD-I01,
// DD-I10, DD-I12; #872), shared by the routes, the public read, the erasure contributor and the image usage contract
// `people` reads. Never imported from a command file's registration path the other way round: commands import this
// file, `di.ts` loads it, and it imports no command (lesson `di-reaches-no-command-file`).
// - Staff: a manager's view of each picture with its state, marks and the marked people without consent (names only
//   here, DD-I10), and a content URL of the manager-checked route — never an attachment id (DD-I12).
// - Public: the pictures BR-I01 allows now, decided per read with `people`'s `imagePublishable` inside the scope the
//   public slug lookup found (no new system-scope lookup).
// - Erasure: every picture that marks a person, live or soft-deleted, is deleted with its marks in the erasure's
//   transaction; its bytes are released after the commit.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { calendarDateInZone, type CalendarDate } from '@vereino/core'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import { ClubEvent, ClubEventFile, ClubEventFilePerson, ClubEventPart } from '../data/entities'
import {
  CLUB_EVENT_FILE_PARTITION,
  CLUB_EVENT_PICTURE_KINDS,
  CLUB_EVENT_PICTURE_OWNER_ENTITY,
  pictureContentUrl,
  type ClubEventPictureKind,
} from '../lib/club-event-files'
import { clubEventPublicPath } from '../lib/club-events'
import { isPublicPicture, missingConsentIds, pictureState, type PictureState } from '../lib/public-pictures'
import { clubTimeZone, findPersons, imagePublishable, type ActivitiesScope } from './directory'

type Scope = ActivitiesScope

const PICTURE_KINDS = [...CLUB_EVENT_PICTURE_KINDS]

/** The ids of the persons marked on `fileId`, in mark order. */
export async function markedPersonIds(em: EntityManager, scope: Scope, fileId: string): Promise<string[]> {
  return (await marksByFile(em, scope, [fileId])).get(fileId) ?? []
}

/** The marked person ids of each picture among `fileIds`, in mark order. */
export async function marksByFile(
  em: EntityManager,
  scope: Scope,
  fileIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (fileIds.length === 0) return result
  const rows = await em.find(
    ClubEventFilePerson,
    { ...scope, fileId: { $in: [...fileIds] } },
    { fields: ['fileId', 'personId'], orderBy: { createdAt: 'asc', personId: 'asc' } },
  )
  for (const row of rows) result.set(row.fileId, [...(result.get(row.fileId) ?? []), row.personId])
  return result
}

/** The live pictures of a club event in their order. */
function livePictures(em: EntityManager, scope: Scope, clubEventId: string): Promise<ClubEventFile[]> {
  return em.find(
    ClubEventFile,
    { ...scope, clubEventId, kind: { $in: PICTURE_KINDS }, deletedAt: null },
    { orderBy: { position: 'asc', createdAt: 'asc', id: 'asc' } },
  )
}

/** Today in the club's zone. */
async function clubToday(container: AwilixContainer, scope: Scope, em?: EntityManager): Promise<CalendarDate> {
  return calendarDateInZone(new Date(), await clubTimeZone(container, scope, em))
}

/** The club's public slug while it publishes its page and the `events` block (DD-T11); else null. */
async function publicEventsSlug(container: AwilixContainer, scope: Scope): Promise<string | null> {
  const settings = await container.resolve<ClubCoreSettingsService>('clubCoreSettings').get(scope)
  const { publication, publicSlug } = settings.publicSettings
  return publication.enabled && publication.blocks.events ? (publicSlug ?? null) : null
}

/** The public page of each club event among `events` whose page a guest can open now (BR-I01 (a)), by event id. */
async function publicEventPaths(
  em: EntityManager,
  container: AwilixContainer,
  scope: Scope,
  events: readonly Pick<ClubEvent, 'id' | 'isPublic' | 'publicSlug'>[],
): Promise<Map<string, string>> {
  const candidates = events.filter((event) => event.isPublic)
  if (candidates.length === 0) return new Map()
  const slug = await publicEventsSlug(container, scope)
  if (!slug) return new Map()
  const parts = await em.find(
    ClubEventPart,
    { ...scope, clubEventId: { $in: candidates.map((event) => event.id) }, deletedAt: null },
    { fields: ['id', 'clubEventId'] },
  )
  const withParts = new Set(parts.map((part) => part.clubEventId))
  const paths = new Map<string, string>()
  for (const event of candidates) {
    const path = withParts.has(event.id) ? clubEventPublicPath(slug, event.publicSlug, true) : null
    if (path) paths.set(event.id, path)
  }
  return paths
}

export type PictureMark = { id: string; displayName: string }

/** A picture as its managers see it (REQ-I04); never an attachment id. */
export type ClubEventPictureView = {
  id: string
  kind: ClubEventPictureKind
  description: string
  position: number
  state: PictureState
  marks: PictureMark[]
  /** The marked people without consent, by name, for the event's managers only (DD-I10). */
  missingConsent: PictureMark[]
  missingConsentCount: number
  peopleConfirmed: boolean
  peopleConfirmedAt: string | null
  publishedAt: string | null
  fileName: string
  mimeType: string
  fileSize: number
  url: string
  createdAt: string
  updatedAt: string
}

/** The pictures of a club event for its managers, with their states under BR-I01. The caller checked the manager. */
export async function clubEventPictureViews(
  container: AwilixContainer,
  scope: Scope,
  event: Pick<ClubEvent, 'id' | 'isPublic' | 'publicSlug'>,
): Promise<ClubEventPictureView[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const pictures = await livePictures(em, scope, event.id)
  if (pictures.length === 0) return []
  const marks = await marksByFile(
    em,
    scope,
    pictures.map((picture) => picture.id),
  )
  const personIds = [...new Set([...marks.values()].flat())]
  const [persons, publishable, paths] = await Promise.all([
    findPersons(container, scope, personIds),
    imagePublishable(container, scope, personIds, await clubToday(container, scope)),
    publicEventPaths(em, container, scope, [event]),
  ])
  const eventPublic = paths.has(event.id)
  const markOf = (id: string): PictureMark => {
    const person = persons.get(id)
    return { id, displayName: person ? `${person.firstName} ${person.lastName}`.trim() : '' }
  }
  return pictures.map((picture) => {
    const facts = {
      kind: picture.kind as ClubEventPictureKind,
      publishedAt: picture.publishedAt ?? null,
      peopleConfirmedAt: picture.peopleConfirmedAt ?? null,
      personIds: marks.get(picture.id) ?? [],
    }
    const missing = missingConsentIds(facts, publishable)
    return {
      id: picture.id,
      kind: facts.kind,
      description: picture.description ?? '',
      position: picture.position,
      state: pictureState(facts, publishable, eventPublic),
      marks: facts.personIds.map(markOf),
      missingConsent: missing.map(markOf),
      missingConsentCount: missing.length,
      peopleConfirmed: facts.peopleConfirmedAt !== null && (facts.kind === 'graphic' || facts.personIds.length > 0),
      peopleConfirmedAt: picture.peopleConfirmedAt?.toISOString() ?? null,
      publishedAt: picture.publishedAt?.toISOString() ?? null,
      fileName: picture.fileName,
      mimeType: picture.mimeType,
      fileSize: picture.fileSize,
      url: pictureContentUrl(event.id, picture.id),
      createdAt: picture.createdAt.toISOString(),
      updatedAt: picture.updatedAt.toISOString(),
    }
  })
}

/**
 * The pictures of a club event a guest may see now (BR-I01), in their order. The caller (the public read) found the
 * club by its slug and checked that the event is public with a live part, so (a) holds; `scope` is that club's.
 */
export async function publicPicturesOf(
  em: EntityManager,
  container: AwilixContainer,
  scope: Scope,
  clubEventId: string,
): Promise<ClubEventFile[]> {
  const pictures = (await livePictures(em, scope, clubEventId)).filter(
    (picture) => picture.publishedAt && picture.peopleConfirmedAt,
  )
  if (pictures.length === 0) return []
  const marks = await marksByFile(
    em,
    scope,
    pictures.map((picture) => picture.id),
  )
  const personIds = [...new Set([...marks.values()].flat())]
  const publishable = await imagePublishable(container, scope, personIds, await clubToday(container, scope, em), em)
  return pictures.filter((picture) =>
    isPublicPicture(
      {
        kind: picture.kind as ClubEventPictureKind,
        publishedAt: picture.publishedAt ?? null,
        peopleConfirmedAt: picture.peopleConfirmedAt ?? null,
        personIds: marks.get(picture.id) ?? [],
      },
      publishable,
      true,
    ),
  )
}

/**
 * The public photos showing `personId` now (event photos spec REQ-I06; `people.imageUsage.activities`): the published
 * pictures that mark the person and pass BR-I01, counted, with the public page of each event (by name).
 */
export async function publicPhotosOf(
  container: AwilixContainer,
  scope: Scope,
  personId: string,
  em: EntityManager = container.resolve<EntityManager>('em').fork(),
): Promise<{ count: number; events: { name: string; url: string }[] }> {
  const marked = await em.find(ClubEventFilePerson, { ...scope, personId }, { fields: ['fileId'] })
  if (marked.length === 0) return { count: 0, events: [] }
  const pictures = await em.find(ClubEventFile, {
    ...scope,
    id: { $in: marked.map((row) => row.fileId) },
    kind: { $in: PICTURE_KINDS },
    deletedAt: null,
    publishedAt: { $ne: null },
    peopleConfirmedAt: { $ne: null },
  })
  if (pictures.length === 0) return { count: 0, events: [] }
  const events = await em.find(
    ClubEvent,
    { ...scope, id: { $in: [...new Set(pictures.map((picture) => picture.clubEventId))] }, deletedAt: null },
    { fields: ['id', 'name', 'isPublic', 'publicSlug'], orderBy: { name: 'asc' } },
  )
  const paths = await publicEventPaths(em, container, scope, events)
  const marks = await marksByFile(
    em,
    scope,
    pictures.map((picture) => picture.id),
  )
  const publishable = await imagePublishable(
    container,
    scope,
    [...new Set([...marks.values()].flat())],
    await clubToday(container, scope, em),
    em,
  )
  const shown = pictures.filter((picture) =>
    isPublicPicture(
      {
        kind: picture.kind as ClubEventPictureKind,
        publishedAt: picture.publishedAt ?? null,
        peopleConfirmedAt: picture.peopleConfirmedAt ?? null,
        personIds: marks.get(picture.id) ?? [],
      },
      publishable,
      paths.has(picture.clubEventId),
    ),
  )
  const shownEvents = new Set(shown.map((picture) => picture.clubEventId))
  return {
    count: shown.length,
    events: events
      .filter((event) => shownEvents.has(event.id))
      .map((event) => ({ name: event.name, url: paths.get(event.id) as string })),
  }
}

/** Deletes picture rows and their marks for good (DD-I12, BR-I07); returns what the bytes release needs. */
export async function deletePictureRows(
  em: EntityManager,
  scope: Scope,
  ids: readonly string[],
): Promise<{ id: string; attachmentId: string }[]> {
  if (ids.length === 0) return []
  const rows = await em.find(ClubEventFile, { ...scope, id: { $in: [...ids] } }, { fields: ['id', 'attachmentId'] })
  await em.nativeDelete(ClubEventFilePerson, { ...scope, fileId: { $in: [...ids] } })
  await em.nativeDelete(ClubEventFile, { ...scope, id: { $in: [...ids] } })
  return rows.map((row) => ({ id: row.id, attachmentId: row.attachmentId }))
}

/** The pictures that mark `personId`, live or soft-deleted (REQ-I10, BR-I07). */
export async function picturesMarking(em: EntityManager, scope: Scope, personId: string): Promise<string[]> {
  const rows = await em.find(ClubEventFilePerson, { ...scope, personId }, { fields: ['fileId'] })
  return [...new Set(rows.map((row) => row.fileId))]
}

/**
 * Releases deleted pictures' bytes after the commit (DD-I12): the owner is the picture and its only assignment. A file
 * already gone counts as released; a failure is reported and leaves bytes that no route serves (the row is gone).
 */
export async function releasePictureFiles(
  ctx: { container: AwilixContainer },
  scope: Scope,
  pictures: readonly { id: string; attachmentId: string }[],
): Promise<number> {
  if (pictures.length === 0 || !ctx.container.hasRegistration('attachmentService')) return 0
  const attachments = ctx.container.resolve<AttachmentService>('attachmentService')
  let released = 0
  for (const picture of pictures) {
    try {
      await attachments.releaseScoped?.({
        attachmentId: picture.attachmentId,
        ...scope,
        expectedOwner: { entityId: CLUB_EVENT_PICTURE_OWNER_ENTITY, recordId: picture.id },
        expectedAssignment: { type: CLUB_EVENT_PICTURE_OWNER_ENTITY, id: picture.id },
        expectedPartitionCode: CLUB_EVENT_FILE_PARTITION,
      })
      released += 1
    } catch (error: unknown) {
      if (isCrudHttpError(error) && error.status === 404) released += 1
      else
        getTelemetryRuntime()?.reportError(error, { module: 'activities', code: 'activities.picture_release_failed' })
    }
  }
  return released
}

/** One picture of a club event as its managers see it, after a write; null when it is gone. */
export async function clubEventPictureView(
  container: AwilixContainer,
  scope: Scope,
  clubEventId: string,
  fileId: string,
): Promise<ClubEventPictureView | null> {
  const event = await container
    .resolve<EntityManager>('em')
    .fork()
    .findOne(ClubEvent, { ...scope, id: clubEventId, deletedAt: null }, { fields: ['id', 'isPublic', 'publicSlug'] })
  if (!event) return null
  return (await clubEventPictureViews(container, scope, event)).find((picture) => picture.id === fileId) ?? null
}
