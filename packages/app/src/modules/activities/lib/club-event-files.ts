// The files of a club event (club events spec DD-T10, REQ-T08, Q-T08; #379): the poster — one per event, PNG, JPEG
// or WebP up to 5 MB, a new one replaces the old — and up to 12 funder logos in the same formats up to 2 MB each,
// each with the funder's name (2–120 characters, the image's alternative text), shown in upload order. Pure: the
// format is read from the file's bytes by `checkFileBytes` of `@vereino/core`, never from its name or declared type,
// so an SVG renamed `.png` or a PDF is refused. No database, no framework.
//
// Event photos spec (REQ-I01, DD-I02; #872): the kinds `photo` and `graphic` are the event's pictures — JPEG, PNG or
// WebP up to 10 MB, at most 30 live per event, each with a description of 2–200 characters (its alternative text). A
// picture's bytes have their own owner (`activities:club_event_picture`, the record is the picture) as their only
// assignment, so deleting a picture releases them (DD-I12); staff open them only through the manager-checked content
// route, never through the platform image route.
import { checkFileBytes, type FileCheck, type FileFormat } from '@vereino/core'

export const CLUB_EVENT_FILE_KINDS = ['poster', 'funder_logo', 'photo', 'graphic'] as const
export type ClubEventFileKind = (typeof CLUB_EVENT_FILE_KINDS)[number]

/** The poster and the funder logos: the files shown as they are (DD-T10). */
export const CLUB_EVENT_DOCUMENT_KINDS = ['poster', 'funder_logo'] as const satisfies readonly ClubEventFileKind[]

/** The pictures of an event (DD-I02): public only under BR-I01. */
export const CLUB_EVENT_PICTURE_KINDS = ['photo', 'graphic'] as const satisfies readonly ClubEventFileKind[]
export type ClubEventPictureKind = (typeof CLUB_EVENT_PICTURE_KINDS)[number]

/** Whether `kind` is a picture kind (`photo` or `graphic`). */
export function isPictureKind(kind: string): kind is ClubEventPictureKind {
  return kind === 'photo' || kind === 'graphic'
}

/** The attachment owner of a picture; the record is the picture's own id, the owner its only assignment (DD-I12). */
export const CLUB_EVENT_PICTURE_OWNER_ENTITY = 'activities:club_event_picture'

/** Attachment owner (the club event) and assignment (the file link); `readScoped` matches them exactly. */
export const CLUB_EVENT_FILE_OWNER_ENTITY = 'activities:club_event'
export const CLUB_EVENT_FILE_ASSIGNMENT = 'activities:club_event_file'
/** The private partition of the platform `attachments` module. */
export const CLUB_EVENT_FILE_PARTITION = 'privateAttachments'

/** Images only: PNG, JPEG, WebP — no SVG (script risk) and no PDF (not shown inline on a phone). */
export const CLUB_EVENT_FILE_FORMATS: readonly FileFormat[] = ['png', 'jpeg', 'webp']
/** 5 MB: a poster scanned or exported for print. */
export const POSTER_MAX_BYTES = 5 * 1024 * 1024
/** 2 MB, like a club logo (glossary *Logo*). */
export const FUNDER_LOGO_MAX_BYTES = 2 * 1024 * 1024
/** At most 12 live funder logos per event (422 `club_event_funders_limit`). */
export const MAX_FUNDER_LOGOS = 12
export const FUNDER_NAME_MIN = 2
export const FUNDER_NAME_MAX = 120

/** 10 MB: a phone photo (REQ-I01). */
export const PICTURE_MAX_BYTES = 10 * 1024 * 1024
/** At most 30 live pictures per event (422 `club_event_pictures_limit`). */
export const MAX_PICTURES = 30
export const PICTURE_DESCRIPTION_MIN = 2
export const PICTURE_DESCRIPTION_MAX = 200
/** At most 60 people marked on one photo. */
export const MAX_PICTURE_MARKS = 60

/** The size limit of a file of `kind`. */
export function clubEventFileMaxBytes(kind: ClubEventFileKind): number {
  if (kind === 'poster') return POSTER_MAX_BYTES
  if (kind === 'funder_logo') return FUNDER_LOGO_MAX_BYTES
  return PICTURE_MAX_BYTES
}

/** Checks an upload of `kind` by its bytes: the format (PNG, JPEG, WebP) and the size limit of the kind. */
export function checkClubEventFile(bytes: Uint8Array, kind: ClubEventFileKind): FileCheck {
  return checkFileBytes(bytes, CLUB_EVENT_FILE_FORMATS, clubEventFileMaxBytes(kind))
}

export type FunderName = { valid: true; name: string | null } | { valid: false }

/**
 * The funder's name of an upload, trimmed: required for a logo (2–120 characters), absent for a poster (null). Not
 * valid when a logo has none or one of the wrong length.
 */
export function funderNameOf(kind: ClubEventFileKind, raw: string | null | undefined): FunderName {
  if (kind !== 'funder_logo') return { valid: true, name: null }
  const name = (raw ?? '').trim()
  return name.length >= FUNDER_NAME_MIN && name.length <= FUNDER_NAME_MAX ? { valid: true, name } : { valid: false }
}

/** Whether another logo would pass the limit of 12, given the count of live logos. */
export function fundersLimitReached(liveLogos: number): boolean {
  return liveLogos >= MAX_FUNDER_LOGOS
}

/** The position of the next logo: one after the highest live position, 0 for the first logo or for the poster. */
export function nextFilePosition(positions: readonly number[]): number {
  return positions.length === 0 ? 0 : Math.max(...positions) + 1
}

/** Whether another picture would pass the limit of 30, given the count of live pictures. */
export function picturesLimitReached(livePictures: number): boolean {
  return livePictures >= MAX_PICTURES
}

/**
 * A picture's description, trimmed: required for a picture (2–200 characters), absent for the poster and the logos
 * (null). Not valid when a picture has none or one of the wrong length.
 */
export function pictureDescriptionOf(kind: ClubEventFileKind, raw: string | null | undefined): FunderName {
  if (!isPictureKind(kind)) return { valid: true, name: null }
  const text = (raw ?? '').trim()
  return text.length >= PICTURE_DESCRIPTION_MIN && text.length <= PICTURE_DESCRIPTION_MAX
    ? { valid: true, name: text }
    : { valid: false }
}

/**
 * The new positions after moving `id` to `target` (0-based, clamped) in `orderedIds` (the pictures in their order):
 * every picture gets its index, and only the ones whose stored position changes are returned.
 */
export function reorderedPositions(
  ordered: readonly { id: string; position: number }[],
  id: string,
  target: number,
): Map<string, number> {
  const ids = ordered.map((row) => row.id)
  const from = ids.indexOf(id)
  const changes = new Map<string, number>()
  if (from < 0) return changes
  ids.splice(from, 1)
  ids.splice(Math.max(0, Math.min(target, ids.length)), 0, id)
  const stored = new Map(ordered.map((row) => [row.id, row.position]))
  ids.forEach((rowId, index) => {
    if (stored.get(rowId) !== index) changes.set(rowId, index)
  })
  return changes
}

/** The manager-only route that streams a picture's bytes (never the platform image route, DD-I12). */
export function pictureContentUrl(clubEventId: string, fileId: string): string {
  return `/api/activities/club-events/${encodeURIComponent(clubEventId)}/files/${encodeURIComponent(fileId)}/content`
}

/** The staff preview URL of an image attachment (the authenticated platform image route). */
export function staffImageUrl(attachmentId: string): string {
  return `/api/attachments/image/${encodeURIComponent(attachmentId)}`
}

export type ClubEventFileRow = {
  id: string
  kind: string
  position: number
  createdAt: Date | string
}

/** The poster first, then the logos in upload order (position, then creation, then id). */
export function sortClubEventFiles<T extends ClubEventFileRow>(rows: readonly T[]): T[] {
  const time = (value: Date | string) => new Date(value).getTime()
  return [...rows].sort((a, b) => {
    const kind = (a.kind === 'poster' ? 0 : 1) - (b.kind === 'poster' ? 0 : 1)
    if (kind !== 0) return kind
    if (a.position !== b.position) return a.position - b.position
    const created = time(a.createdAt) - time(b.createdAt)
    if (created !== 0) return created
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
