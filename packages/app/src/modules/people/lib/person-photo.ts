// The person's photo (people life-cycle spec *Data Models* → `people_persons.photo_attachment_id`, REQ-L12; #312):
// PNG, JPEG or WebP up to 5 MB, its format read from the file's magic bytes (`@vereino/core` `file-format.ts`), so an
// SVG or HTML file renamed to `.png` is refused. Pure: the route reads the upload, the command stores it.
import { checkFileBytes, type FileFormat } from '@vereino/core'

/** Formats a person photo may have: no SVG (script risk). */
export const PERSON_PHOTO_FORMATS: readonly FileFormat[] = ['png', 'jpeg', 'webp']
/** 5 MB: a phone photo. */
export const PERSON_PHOTO_MAX_BYTES = 5 * 1024 * 1024

/**
 * Attachment owner of the photo (the person). The upload adds the owner as the file's only assignment, so the scoped
 * read names it and the erasure can release the file (#308; lesson `attachment-owner-assignment-and-release`). Photos
 * stored before #308 also carry the assignment `people:person_photo`: they are still read, but `releaseScoped` refuses
 * to delete them (the erasure clears the pointer and reports the file as kept).
 */
export const PERSON_PHOTO_OWNER_ENTITY = 'people:person'
/** The private partition the photo is stored in. */
export const PERSON_PHOTO_PARTITION = 'privateAttachments'

/** A photo upload: PNG, JPEG or WebP up to 5 MB. */
export function checkPersonPhoto(bytes: Uint8Array) {
  return checkFileBytes(bytes, PERSON_PHOTO_FORMATS, PERSON_PHOTO_MAX_BYTES)
}
