// The files of a club event (club events spec DD-T10, REQ-T08, Q-T08; #379): the poster — one per event, PNG, JPEG
// or WebP up to 5 MB, a new one replaces the old — and up to 12 funder logos in the same formats up to 2 MB each,
// each with the funder's name (2–120 characters, the image's alternative text), shown in upload order. Pure: the
// format is read from the file's bytes by `checkFileBytes` of `@vereino/core`, never from its name or declared type,
// so an SVG renamed `.png` or a PDF is refused. No database, no framework.
import { checkFileBytes, type FileCheck, type FileFormat } from '@vereino/core'

export const CLUB_EVENT_FILE_KINDS = ['poster', 'funder_logo'] as const
export type ClubEventFileKind = (typeof CLUB_EVENT_FILE_KINDS)[number]

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

/** The size limit of a file of `kind`. */
export function clubEventFileMaxBytes(kind: ClubEventFileKind): number {
  return kind === 'poster' ? POSTER_MAX_BYTES : FUNDER_LOGO_MAX_BYTES
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
  if (kind === 'poster') return { valid: true, name: null }
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
