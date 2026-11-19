// The person's photo (people life-cycle spec *Data Models* → `people_persons.photo_attachment_id`, REQ-L12; #312):
// PNG, JPEG or WebP up to 5 MB, its format read from the file's magic bytes (`@vereino/core` `file-format.ts`), so an
// SVG or HTML file renamed to `.png` is refused. Pure: the route reads the upload, the command stores it.
import { checkFileBytes, type FileFormat } from '@vereino/core'

/** Formats a person photo may have: no SVG (script risk). */
export const PERSON_PHOTO_FORMATS: readonly FileFormat[] = ['png', 'jpeg', 'webp']
/** 5 MB: a phone photo. */
export const PERSON_PHOTO_MAX_BYTES = 5 * 1024 * 1024

/** Attachment owner (the person) and assignment of the photo; the scoped read names exactly this file. */
export const PERSON_PHOTO_OWNER_ENTITY = 'people:person'
export const PERSON_PHOTO_ASSIGNMENT = 'people:person_photo'
/** The private partition the photo is stored in. */
export const PERSON_PHOTO_PARTITION = 'privateAttachments'

/** A photo upload: PNG, JPEG or WebP up to 5 MB. */
export function checkPersonPhoto(bytes: Uint8Array) {
  return checkFileBytes(bytes, PERSON_PHOTO_FORMATS, PERSON_PHOTO_MAX_BYTES)
}
