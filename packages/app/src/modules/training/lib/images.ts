// The images of an outline (training outlines spec *API* → `/api/training/outlines/[id]/images`; REQ-O06: upload only,
// no drawing editor; #683): JPEG, PNG or WebP up to 5 MB, read from the bytes, at most 12 per outline, one per
// exercise. The bytes live in the platform's `attachments` module, private partition, owned by the outline that
// uploaded them; the owner assignment is the only one, so the module can release the file later (lesson
// `attachment-owner-assignment-and-release`).
import { checkFileBytes, type FileCheck, type FileFormat } from '@vereino/core'
import { OUTLINE_LIMITS, outlineImages, type OutlineParts } from './outline'

export const OUTLINE_IMAGE_OWNER_ENTITY = 'training:outline'
export const OUTLINE_IMAGE_PARTITION = 'privateAttachments'
export const OUTLINE_IMAGE_FORMATS: readonly FileFormat[] = ['jpeg', 'png', 'webp']
export const OUTLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** An uploaded image, by its bytes. */
export function checkOutlineImage(bytes: Uint8Array): FileCheck {
  return checkFileBytes(bytes, OUTLINE_IMAGE_FORMATS, OUTLINE_IMAGE_MAX_BYTES)
}

/** Whether one more image fits: replacing an exercise's image does not count twice. */
export function imageFits(parts: OutlineParts, replacing: boolean): boolean {
  return outlineImages(parts).length - (replacing ? 1 : 0) < OUTLINE_LIMITS.images
}

/** The authenticated route of one image of an outline. */
export function outlineImageUrl(outlineId: string, attachmentId: string): string {
  return `/api/training/outlines/${encodeURIComponent(outlineId)}/images/${encodeURIComponent(attachmentId)}`
}
