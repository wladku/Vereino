// Files the club publishes (club spec glossary *Logo*, REQ-025, REQ-028; engineering standards S8.11): the club and
// section logos, the section materials, and a place's photos and regulations PDF (UX parity spec, REQ-U03). Pure: the
// format is read from the file's magic bytes, never from its name or declared type, so an SVG or HTML file renamed to
// `.png` is still refused. The byte checks live in `@vereino/core` (`file-format.ts`, shared with the incident photos
// of `facilities`, #126) and are re-exported here.
import { checkFileBytes } from '@vereino/core'

export {
  FORMAT_MIME_TYPES,
  detectFileFormat,
  storedFileName,
  type CheckedFile,
  type FileFormat,
  type FileProblem,
} from '@vereino/core'

/** Formats a logo may have: PNG, JPEG, WebP — no SVG (script risk). */
export const LOGO_FORMATS = ['png', 'jpeg', 'webp'] as const
/** Formats a section material may have: PDF and the logo image formats. */
export const MATERIAL_FORMATS = ['pdf', 'png', 'jpeg', 'webp'] as const

/** 2 MB (glossary *Logo*). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
/** 10 MB: a scanned regulation or declaration form. */
export const MATERIAL_MAX_BYTES = 10 * 1024 * 1024

/** A logo upload: PNG, JPEG or WebP up to 2 MB. */
export function checkLogo(bytes: Uint8Array) {
  return checkFileBytes(bytes, LOGO_FORMATS, LOGO_MAX_BYTES)
}

/** A section material upload: PDF, PNG, JPEG or WebP up to 10 MB. */
export function checkMaterial(bytes: Uint8Array) {
  return checkFileBytes(bytes, MATERIAL_FORMATS, MATERIAL_MAX_BYTES)
}

/** The kinds of a place file (UX parity spec, REQ-U03): photos, and the one regulations PDF. */
export const PLACE_FILE_KINDS = ['photo', 'regulations'] as const

/** Attachment owner (the place) and assignment (the file link) of a place file (the upload and the public read). */
export const PLACE_FILE_OWNER_ENTITY = 'club_core:place'
export const PLACE_FILE_ASSIGNMENT = 'club_core:place_file'
export type PlaceFileKind = (typeof PLACE_FILE_KINDS)[number]

/** Formats of a place photo: the logo image formats (no SVG). */
export const PLACE_PHOTO_FORMATS = LOGO_FORMATS
/** 5 MB: a phone photo of a pitch or a hall. */
export const PLACE_PHOTO_MAX_BYTES = 5 * 1024 * 1024
/** A place holds at most 10 live photos. */
export const PLACE_PHOTOS_MAX = 10
/** 10 MB, like a section material. */
export const PLACE_REGULATIONS_MAX_BYTES = MATERIAL_MAX_BYTES

/** A place file upload: a PNG, JPEG or WebP photo up to 5 MB, or a regulations PDF up to 10 MB. */
export function checkPlaceFile(bytes: Uint8Array, kind: PlaceFileKind) {
  return kind === 'photo'
    ? checkFileBytes(bytes, PLACE_PHOTO_FORMATS, PLACE_PHOTO_MAX_BYTES)
    : checkFileBytes(bytes, ['pdf'], PLACE_REGULATIONS_MAX_BYTES)
}

/** The position of the next photo: one after the highest live position, 0 for the first photo. */
export function nextPhotoPosition(positions: readonly number[]): number {
  return positions.length === 0 ? 0 : Math.max(...positions) + 1
}

export type LogoSource = 'section' | 'club' | 'initial'

/**
 * The effective logo (glossary *Logo*): the section's own logo, else the club logo, else the initial of the club
 * name (never an empty image). Without a section only the club logo counts.
 */
export function effectiveLogo(input: { sectionLogoId?: string | null; clubLogoId: string | null }): {
  attachmentId: string | null
  source: LogoSource
} {
  if (input.sectionLogoId) return { attachmentId: input.sectionLogoId, source: 'section' }
  if (input.clubLogoId) return { attachmentId: input.clubLogoId, source: 'club' }
  return { attachmentId: null, source: 'initial' }
}

/** The initial shown instead of a missing logo: the first letter or digit of the name, upper-cased. */
export function nameInitial(name: string | null | undefined): string {
  const match = (name ?? '').match(/[\p{L}\p{N}]/u)
  return match ? match[0].toLocaleUpperCase() : '?'
}

/** The authenticated URL of a logo image (the platform's attachment image route, same organization only). */
export function staffLogoUrl(attachmentId: string | null, size = 128): string | null {
  return attachmentId
    ? `/api/attachments/image/${attachmentId}?width=${String(size)}&height=${String(size)}&cropType=contain`
    : null
}
